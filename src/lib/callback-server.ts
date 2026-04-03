import * as http from 'http';
import { CliError, EXIT_CODES } from './errors';
import { normalizeSite, SupportedSite } from './sites';

export function waitForCallback(
  port: number,
  expectedSite: SupportedSite,
  expectedState: string,
): Promise<{ token: string; site: SupportedSite }> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      server.close(() => callback());
    };

    const server = http.createServer((req, res) => {
      if (req.method !== 'GET') {
        res.writeHead(404);
        res.end();
        return;
      }

      const requestUrl = new URL(req.url || '/', `http://localhost:${port}`);
      const token = requestUrl.searchParams.get('token');
      const site = normalizeSite(requestUrl.searchParams.get('site') || expectedSite);
      const state = requestUrl.searchParams.get('state');

      if (state !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body><h2>Invalid login state</h2></body></html>');
        finish(() => reject(new CliError('Login failed: invalid callback state.', EXIT_CODES.AUTH_ERROR)));
        return;
      }

      if (site !== expectedSite) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body><h2>Login site mismatch</h2></body></html>');
        finish(() => reject(new CliError('Login failed: callback site mismatch.', EXIT_CODES.AUTH_ERROR)));
        return;
      }

      if (token) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<html><body style="font-family:sans-serif;padding:40px;text-align:center;">
          <h2 style="color:#22c55e;">✅ Login successful</h2>
          <p style="color:#666;">Token saved. You can close this window.</p>
        </body></html>`);
        finish(() => resolve({ token, site }));
        return;
      }

      const error = requestUrl.searchParams.get('error') || 'Unknown error';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<html><body style="font-family:sans-serif;padding:40px;text-align:center;">
        <h2 style="color:#ef4444;">❌ Login failed</h2>
        <p style="color:#666;">${error}</p>
      </body></html>`);
      finish(() => reject(new CliError(error, EXIT_CODES.AUTH_ERROR)));
    });

    server.listen(port, '127.0.0.1');

    setTimeout(() => {
      finish(() => reject(new CliError('Login timeout (5 minutes). Please try again.', EXIT_CODES.AUTH_ERROR)));
    }, 5 * 60 * 1000);
  });
}

export function getAvailablePort(start: number): Promise<number> {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(start, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : start;
      server.close(() => resolve(port));
    });
    server.on('error', () => resolve(getAvailablePort(start + 1)));
  });
}
