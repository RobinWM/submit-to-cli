"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.waitForCallback = waitForCallback;
exports.getAvailablePort = getAvailablePort;
const http = __importStar(require("http"));
const errors_1 = require("./errors");
const sites_1 = require("./sites");
function waitForCallback(port, expectedSite, expectedState) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (callback) => {
            if (settled)
                return;
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
            const site = (0, sites_1.normalizeSite)(requestUrl.searchParams.get('site') || expectedSite);
            const state = requestUrl.searchParams.get('state');
            if (state !== expectedState) {
                res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end('<html><body><h2>Invalid login state</h2></body></html>');
                finish(() => reject(new errors_1.CliError('Login failed: invalid callback state.', errors_1.EXIT_CODES.AUTH_ERROR)));
                return;
            }
            if (site !== expectedSite) {
                res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end('<html><body><h2>Login site mismatch</h2></body></html>');
                finish(() => reject(new errors_1.CliError('Login failed: callback site mismatch.', errors_1.EXIT_CODES.AUTH_ERROR)));
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
            finish(() => reject(new errors_1.CliError(error, errors_1.EXIT_CODES.AUTH_ERROR)));
        });
        server.listen(port, '127.0.0.1');
        setTimeout(() => {
            finish(() => reject(new errors_1.CliError('Login timeout (5 minutes). Please try again.', errors_1.EXIT_CODES.AUTH_ERROR)));
        }, 5 * 60 * 1000);
    });
}
function getAvailablePort(start) {
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
