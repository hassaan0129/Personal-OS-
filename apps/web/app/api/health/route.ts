import { parseWebEnvironment } from '@personal-os/config/web';

export const runtime = 'nodejs';

export function GET() {
  parseWebEnvironment(process.env);

  return Response.json({
    service: 'web',
    status: 'ok',
  });
}
