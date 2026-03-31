import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

export interface EncryptedPayload {
  encrypted: string;
  iv: string;
  tag: string;
}

function toKeyBuffer(key: string): Buffer {
  return Buffer.from(key.slice(0, 64), 'hex');
}

export function encrypt(plaintext: string, hexKey: string): EncryptedPayload {
  const iv = randomBytes(12);
  const keyBuffer = toKeyBuffer(hexKey);
  const cipher = createCipheriv('aes-256-gcm', keyBuffer, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    encrypted: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
  };
}

export function decrypt(payload: EncryptedPayload, hexKey: string): string {
  const keyBuffer = toKeyBuffer(hexKey);
  const decipher = createDecipheriv(
    'aes-256-gcm',
    keyBuffer,
    Buffer.from(payload.iv, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(payload.tag, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.encrypted, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
