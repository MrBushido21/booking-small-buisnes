import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthEntity } from 'src/auth/entities/auth.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { BuisnesEntity } from './entities/buisne.entity';
import { Repository, In, DataSource} from 'typeorm';
import { MasterEntity } from './entities/master.entity';
import { ServicesEntity } from './entities/services.entity';
import { AuthService } from 'src/auth/auth.service';
import { CreateBuisneDto } from './dto/create-buisne.dto';
import { CreateServiceDto } from './dto/create-service.dto';
import { CreateMasterDto } from './dto/create-master.dto';
import { WeekDto } from './dto/week.dto';
import { LoginDto } from 'src/auth/dto/login.dto';

@Injectable()
export class BuisnesService {
  constructor(
    private readonly authService: AuthService,
    private readonly dataSource: DataSource,
    @InjectRepository(BuisnesEntity)
    private readonly buisnesRepo: Repository<BuisnesEntity>,
    @InjectRepository(MasterEntity)
    private readonly masterRepo: Repository<MasterEntity>,
    @InjectRepository(ServicesEntity)
    private readonly servicesRepo: Repository<ServicesEntity>,
  ) {

  }
  async buisnes_create(body: CreateBuisneDto, user: AuthEntity) {
    if (user.role === "master") throw new ForbiddenException("You do not have owner rights")
    return await this.buisnesRepo.save({ title: body.title, address: body.address, timezone: body.timezone, owner_id: user.id })
  }
  async services_create(body: CreateServiceDto, user: AuthEntity) {
    if (user.role === "master") throw new ForbiddenException("You do not have owner rights")
    const buisnes = await this.buisnesRepo.findOne({ where: { id: body.buisnes_id, owner_id: user.id} })
    if (!buisnes) throw new NotFoundException("Buisnes not found")
    return await this.servicesRepo.save({
      service: body.service, duration: body.duration, price: body.price, buisnes_id: body.buisnes_id
    })
  }
  async masters_create(body: CreateMasterDto, user: AuthEntity) {
    if (user.role === "master") throw new ForbiddenException("You do not have owner rights")
    const buisnes = await this.buisnesRepo.findOne({ where: { id: body.buisnes_id, owner_id: user.id } })
    if (!buisnes) throw new NotFoundException("Buisnes not found")

    const ids = body.services.map(service => service.id);

    const foundServices = await this.servicesRepo.find({
      where: { id: In(ids) }
    });

    if (foundServices.length !== ids.length) {
      const foundIds = foundServices.map(s => s.id);
      const missingIds = ids.filter(id => !foundIds.includes(id));
      throw new NotFoundException(`Services not found: ${missingIds.join(", ")}`);
    }
    return await this.dataSource.transaction(async (manager) => {
    // 1) аккаунт в auth — через ТОТ ЖЕ manager
    const account = await this.authService.createMaster(body.email, body.password, manager)

    // 2) мастер — тоже через manager
    const master = manager.getRepository(MasterEntity).create({
      name: body.name, specialism: body.specialism, description: body.description,
      photo: body.photo, work_time: body.work_time, services: foundServices,
      buisnes_id: body.buisnes_id,
      auth_id: account.id
    })
    return await manager.getRepository(MasterEntity).save(master)
  })
  }


  async master_login(body: LoginDto) {
    const master_account = await this.authService.login(body)
    const master = await this.masterRepo.findOne({where: {auth_id: master_account.auth_id},
    relations: { bookings: true, services: true}}
    )
    return {accessToken: master_account.accessToken, refreshToken: master_account.refreshToken, master}
  }

  async master_post_week(body: WeekDto, user:AuthEntity) {
    const master = await this.masterRepo.findOne({where: {auth_id: user.id}})
    if (!master) throw new NotFoundException("Master not found")

    // трогаем только свою запись (auth_id из токена) → чужое расписание не редактируется
    await this.masterRepo.update({auth_id: user.id}, {work_time: body.work_time})
    return this.masterRepo.findOne({where: {auth_id: user.id}, relations: { bookings: true, services: true}})
  }
}
