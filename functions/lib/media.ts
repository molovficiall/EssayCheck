import { HttpError } from './errors';

export type ImageContentType = 'image/jpeg' | 'image/png' | 'image/webp';
export type ImageExtension = 'jpg' | 'png' | 'webp';

export function validateImageUpload(
  contentType: string,
  bytes: Uint8Array,
  size: number,
): { contentType: ImageContentType; extension: ImageExtension } {
  if (size < 1 || size > 5 * 1024 * 1024)
    throw new HttpError(413, 'Image must be 5 MB or smaller');
  if (
    contentType === 'image/jpeg' &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return { contentType, extension: 'jpg' };
  if (
    contentType === 'image/png' &&
    bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10'
  )
    return { contentType, extension: 'png' };
  if (
    contentType === 'image/webp' &&
    new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' &&
    new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP'
  )
    return { contentType, extension: 'webp' };
  throw new HttpError(415, 'Unsupported or invalid image');
}
