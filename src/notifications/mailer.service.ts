import { Injectable } from "@nestjs/common";
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailerService {
  private transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
  });
  async send(to: string, subject: string, html: string) {
    await this.transport.sendMail({ from: process.env.MAIL_FROM, to, subject, html });
  }
}