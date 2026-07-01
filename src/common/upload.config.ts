import { randomUUID } from 'crypto';
import { extname } from 'path';
import { diskStorage } from 'multer';
import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';

// Куда и под каким именем класть файлы
export const photoStorage = diskStorage({
  destination: './uploads',
  filename: (_req, file, cb) => {
    // случайное имя, чтобы не было коллизий и нельзя было угадать чужой файл
    const ext = extname(file.originalname).toLowerCase();
    cb(null, `${randomUUID()}${ext}`);
  },
});

// Пропускаем ТОЛЬКО растровые картинки. svg отсекается намеренно:
// в него можно вшить <script> → XSS, если файл потом отдаётся браузеру.
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export const photoFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  if (!ALLOWED_MIME.includes(file.mimetype)) {
    return cb(
      new BadRequestException(
        'Недопустимый формат файла. Разрешены: jpeg, png, webp, gif',
      ),
      false,
    );
  }
  cb(null, true);
};

// Готовый набор опций для FileInterceptor
export const photoMulterOptions = {
  storage: photoStorage,
  fileFilter: photoFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 МБ
};
