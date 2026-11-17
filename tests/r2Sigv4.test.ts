import { describe, expect, it } from 'vitest';
import { assinar, assinarPedido, chaveAssinatura, nomeDoBucket, parseListagem, queryCanonica, sha256Hex, uriEncode } from '../scripts/lib/r2.mts';

// Vetor da documentação da AWS (SigV4, exemplo IAM ListUsers).
const SECRET = 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY';
const CANONICO = [
  'GET',
  '/',
  'Action=ListUsers&Version=2010-05-08',
  'content-type:application/x-www-form-urlencoded; charset=utf-8',
  'host:iam.amazonaws.com',
  'x-amz-date:20150830T123600Z',
  '',
  'content-type;host;x-amz-date',
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
].join('\n');

describe('SigV4', () => {
  it('hash da requisição canônica e assinatura batem com o vetor da AWS', () => {
    expect(sha256Hex(CANONICO)).toBe('f536975d06c0309214f805bb90ccff089219ecd68b2577efef23edd43b7e1a59');
    const aAssinar = ['AWS4-HMAC-SHA256', '20150830T123600Z', '20150830/us-east-1/iam/aws4_request', sha256Hex(CANONICO)].join('\n');
    expect(assinar(SECRET, '20150830', 'us-east-1', 'iam', aAssinar)).toBe('5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7');
  });

  it('chave derivada do vetor da AWS', () => {
    expect(chaveAssinatura(SECRET, '20150830', 'us-east-1', 'iam').toString('hex')).toBe('c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9');
  });

  it('codificação de URI e query canônica ordenada', () => {
    expect(uriEncode('a b/c~é')).toBe('a%20b%2Fc~%C3%A9');
    expect(uriEncode('a b/c', true)).toBe('a%20b/c');
    expect(queryCanonica({ prefix: 'textures/', 'list-type': '2' })).toBe('list-type=2&prefix=textures%2F');
  });

  it('assinarPedido produz o cabeçalho Authorization esperado', () => {
    const h = assinarPedido({ metodo: 'GET', host: 'x.r2.cloudflarestorage.com', caminho: '/b', query: { 'list-type': '2' }, regiao: 'auto', servico: 's3', accessKeyId: 'AK', secretAccessKey: 'SK', amzDate: '20260101T000000Z' });
    expect(h.Authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AK\/20260101\/auto\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
  });
});

describe('parse da listagem', () => {
  it('lê Key/Size em qualquer ordem, entidades XML e token', () => {
    const xml = `<?xml version="1.0"?><ListBucketResult><IsTruncated>true</IsTruncated>
      <Contents><Size>10</Size><Key>textures/A&amp;B/Color.jpg</Key><ETag>x</ETag></Contents>
      <Contents><Key>textures/C/Color.jpg</Key><Size>7</Size></Contents>
      <NextContinuationToken>tok+/=</NextContinuationToken></ListBucketResult>`;
    expect(parseListagem(xml)).toEqual({ objetos: [{ key: 'textures/A&B/Color.jpg', size: 10, etag: 'x' }, { key: 'textures/C/Color.jpg', size: 7 }], truncada: true, proximoToken: 'tok+/=' });
  });

  it('última página não tem token', () => {
    expect(parseListagem('<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>')).toEqual({ objetos: [], truncada: false });
  });
});

describe('nomeDoBucket', () => {
  it('aceita nome simples ou URL completa', () => {
    expect(nomeDoBucket('meu-bucket')).toBe('meu-bucket');
    expect(nomeDoBucket('https://abc.r2.cloudflarestorage.com/meu-bucket')).toBe('meu-bucket');
    expect(nomeDoBucket('https://abc.r2.cloudflarestorage.com/meu-bucket/')).toBe('meu-bucket');
  });
});
