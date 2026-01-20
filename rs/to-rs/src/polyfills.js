// Web API polyfills for deno_core

// AbortController and AbortSignal polyfill
class AbortSignal {
  constructor() {
    this.aborted = false;
    this.reason = undefined;
    this._listeners = new Map();
  }

  addEventListener(type, listener) {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, []);
    }
    this._listeners.get(type).push(listener);
  }

  removeEventListener(type, listener) {
    const listeners = this._listeners.get(type);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  dispatchEvent(event) {
    const listeners = this._listeners.get(event.type);
    if (listeners) {
      listeners.forEach(listener => {
        if (typeof listener === 'function') {
          listener(event);
        } else if (listener && typeof listener.handleEvent === 'function') {
          listener.handleEvent(event);
        }
      });
    }
    return true;
  }

  throwIfAborted() {
    if (this.aborted) {
      throw this.reason;
    }
  }

  static abort(reason) {
    const signal = new AbortSignal();
    signal.aborted = true;
    signal.reason = reason !== undefined ? reason : new DOMException('This operation was aborted', 'AbortError');
    return signal;
  }

  static timeout(milliseconds) {
    const signal = new AbortSignal();
    setTimeout(() => {
      signal.aborted = true;
      signal.reason = new DOMException('The operation timed out', 'TimeoutError');
      signal.dispatchEvent({ type: 'abort' });
    }, milliseconds);
    return signal;
  }
}

class AbortController {
  constructor() {
    this.signal = new AbortSignal();
  }

  abort(reason) {
    if (this.signal.aborted) return;
    this.signal.aborted = true;
    this.signal.reason = reason !== undefined ? reason : new DOMException('This operation was aborted', 'AbortError');
    this.signal.dispatchEvent({ type: 'abort' });
  }
}

globalThis.AbortController = AbortController;
globalThis.AbortSignal = AbortSignal;

// DOMException polyfill
class DOMException extends Error {
  constructor(message = '', name = 'Error') {
    super(message);
    this.name = name;
    this.code = 0;
  }
}
globalThis.DOMException = DOMException;

// AggregateError polyfill (may already exist in V8)
if (typeof globalThis.AggregateError === 'undefined') {
  class AggregateError extends Error {
    constructor(errors, message) {
      super(message);
      this.name = 'AggregateError';
      this.errors = errors;
    }
  }
  globalThis.AggregateError = AggregateError;
}

// setTimeout/clearTimeout polyfill (using Deno.core timers)
const _timers = new Map();
let _nextTimerId = 1;

if (typeof globalThis.setTimeout === 'undefined') {
  globalThis.setTimeout = function(callback, delay = 0, ...args) {
    const id = _nextTimerId++;
    // For immediate execution (delay 0), execute synchronously
    if (delay <= 0) {
      try {
        callback(...args);
      } catch (e) {
        console.error('setTimeout callback error:', e);
      }
      return id;
    }
    // Store timer info - in our sync context, we'll just execute immediately
    _timers.set(id, { callback, args });
    // Execute after a brief delay by queueing
    Promise.resolve().then(() => {
      const timer = _timers.get(id);
      if (timer) {
        _timers.delete(id);
        try {
          timer.callback(...timer.args);
        } catch (e) {
          console.error('setTimeout callback error:', e);
        }
      }
    });
    return id;
  };
}

if (typeof globalThis.clearTimeout === 'undefined') {
  globalThis.clearTimeout = function(id) {
    _timers.delete(id);
  };
}

if (typeof globalThis.setInterval === 'undefined') {
  globalThis.setInterval = function(callback, delay = 0, ...args) {
    // Minimal implementation - not truly needed for quicktype
    return 0;
  };
}

if (typeof globalThis.clearInterval === 'undefined') {
  globalThis.clearInterval = function(id) {
    // No-op
  };
}

// TextEncoder/TextDecoder polyfill (V8 should have these, but just in case)
if (typeof globalThis.TextEncoder === 'undefined') {
  class TextEncoder {
    constructor() {
      this.encoding = 'utf-8';
    }
    encode(input) {
      const utf8 = [];
      for (let i = 0; i < input.length; i++) {
        let charcode = input.charCodeAt(i);
        if (charcode < 0x80) utf8.push(charcode);
        else if (charcode < 0x800) {
          utf8.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
        } else if (charcode < 0xd800 || charcode >= 0xe000) {
          utf8.push(0xe0 | (charcode >> 12), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
        } else {
          i++;
          charcode = 0x10000 + (((charcode & 0x3ff) << 10) | (input.charCodeAt(i) & 0x3ff));
          utf8.push(0xf0 | (charcode >> 18), 0x80 | ((charcode >> 12) & 0x3f), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
        }
      }
      return new Uint8Array(utf8);
    }
  }
  globalThis.TextEncoder = TextEncoder;
}

if (typeof globalThis.TextDecoder === 'undefined') {
  class TextDecoder {
    constructor(encoding = 'utf-8') {
      this.encoding = encoding;
    }
    decode(input) {
      if (!input) return '';
      const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
      let result = '';
      let i = 0;
      while (i < bytes.length) {
        const byte = bytes[i];
        if (byte < 0x80) {
          result += String.fromCharCode(byte);
          i++;
        } else if ((byte & 0xe0) === 0xc0) {
          result += String.fromCharCode(((byte & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
          i += 2;
        } else if ((byte & 0xf0) === 0xe0) {
          result += String.fromCharCode(((byte & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f));
          i += 3;
        } else if ((byte & 0xf8) === 0xf0) {
          const codePoint = ((byte & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
          result += String.fromCodePoint(codePoint);
          i += 4;
        } else {
          i++;
        }
      }
      return result;
    }
  }
  globalThis.TextDecoder = TextDecoder;
}

// atob/btoa polyfill
if (typeof globalThis.atob === 'undefined') {
  const base64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  globalThis.atob = function(input) {
    const str = String(input).replace(/=+$/, '');
    let output = '';
    for (let bc = 0, bs = 0, buffer, i = 0; buffer = str.charAt(i++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
      buffer = base64chars.indexOf(buffer);
    }
    return output;
  };
}

if (typeof globalThis.btoa === 'undefined') {
  const base64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  globalThis.btoa = function(input) {
    const str = String(input);
    let output = '';
    for (let block = 0, charCode, i = 0, map = base64chars; str.charAt(i | 0) || (map = '=', i % 1); output += map.charAt(63 & block >> 8 - i % 1 * 8)) {
      charCode = str.charCodeAt(i += 3/4);
      if (charCode > 0xFF) {
        throw new Error("'btoa' failed: The string to be encoded contains characters outside of the Latin1 range.");
      }
      block = block << 8 | charCode;
    }
    return output;
  };
}

// URL polyfill (minimal)
if (typeof globalThis.URL === 'undefined') {
  class URL {
    constructor(url, base) {
      if (base) {
        // Simple base URL handling
        if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://')) {
          url = base.replace(/\/[^\/]*$/, '/') + url;
        }
      }
      this.href = url;
      const match = url.match(/^(https?|file):\/\/([^\/]+)?(\/[^?#]*)?\??([^#]*)?#?(.*)?$/);
      if (match) {
        this.protocol = match[1] + ':';
        this.host = match[2] || '';
        this.hostname = this.host.split(':')[0];
        this.port = this.host.split(':')[1] || '';
        this.pathname = match[3] || '/';
        this.search = match[4] ? '?' + match[4] : '';
        this.hash = match[5] ? '#' + match[5] : '';
      } else {
        this.protocol = '';
        this.host = '';
        this.hostname = '';
        this.port = '';
        this.pathname = url;
        this.search = '';
        this.hash = '';
      }
      this.origin = this.protocol + '//' + this.host;
      this.searchParams = new URLSearchParams(this.search);
    }
    toString() {
      return this.href;
    }
  }
  globalThis.URL = URL;
}

// URLSearchParams polyfill
if (typeof globalThis.URLSearchParams === 'undefined') {
  class URLSearchParams {
    constructor(init = '') {
      this._params = new Map();
      if (typeof init === 'string') {
        init = init.replace(/^\?/, '');
        init.split('&').forEach(pair => {
          const [key, value] = pair.split('=');
          if (key) {
            this._params.set(decodeURIComponent(key), decodeURIComponent(value || ''));
          }
        });
      }
    }
    get(name) {
      return this._params.get(name) || null;
    }
    set(name, value) {
      this._params.set(name, value);
    }
    has(name) {
      return this._params.has(name);
    }
    delete(name) {
      this._params.delete(name);
    }
    toString() {
      const pairs = [];
      this._params.forEach((value, key) => {
        pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
      });
      return pairs.join('&');
    }
  }
  globalThis.URLSearchParams = URLSearchParams;
}

// Blob polyfill (minimal)
if (typeof globalThis.Blob === 'undefined') {
  class Blob {
    constructor(parts = [], options = {}) {
      this._parts = parts;
      this.type = options.type || '';
      this.size = parts.reduce((acc, part) => {
        if (typeof part === 'string') return acc + part.length;
        if (part instanceof ArrayBuffer) return acc + part.byteLength;
        if (part instanceof Uint8Array) return acc + part.length;
        if (part instanceof Blob) return acc + part.size;
        return acc;
      }, 0);
    }
    async text() {
      return this._parts.map(part => {
        if (typeof part === 'string') return part;
        if (part instanceof Uint8Array) return new TextDecoder().decode(part);
        if (part instanceof Blob) return ''; // simplified
        return '';
      }).join('');
    }
    async arrayBuffer() {
      const text = await this.text();
      return new TextEncoder().encode(text).buffer;
    }
    slice(start, end, contentType) {
      return new Blob([this._parts.join('').slice(start, end)], { type: contentType || this.type });
    }
  }
  globalThis.Blob = Blob;
}

// File polyfill (minimal)
if (typeof globalThis.File === 'undefined') {
  class File extends Blob {
    constructor(parts, name, options = {}) {
      super(parts, options);
      this.name = name;
      this.lastModified = options.lastModified || Date.now();
    }
  }
  globalThis.File = File;
}

// fetch polyfill (stub - returns error for actual network requests)
if (typeof globalThis.fetch === 'undefined') {
  globalThis.fetch = async function(url, options = {}) {
    // For our use case, quicktype shouldn't need actual network requests
    // Return a rejected promise with a clear error
    throw new Error(`fetch() is not available: attempted to fetch ${url}`);
  };
}

// Headers polyfill (minimal, in case fetch polyfill is extended)
if (typeof globalThis.Headers === 'undefined') {
  class Headers {
    constructor(init = {}) {
      this._headers = new Map();
      if (init) {
        Object.entries(init).forEach(([key, value]) => {
          this._headers.set(key.toLowerCase(), value);
        });
      }
    }
    get(name) {
      return this._headers.get(name.toLowerCase()) || null;
    }
    set(name, value) {
      this._headers.set(name.toLowerCase(), value);
    }
    has(name) {
      return this._headers.has(name.toLowerCase());
    }
    delete(name) {
      this._headers.delete(name.toLowerCase());
    }
  }
  globalThis.Headers = Headers;
}

// Response polyfill (minimal)
if (typeof globalThis.Response === 'undefined') {
  class Response {
    constructor(body, init = {}) {
      this._body = body;
      this.status = init.status || 200;
      this.statusText = init.statusText || '';
      this.headers = new Headers(init.headers);
      this.ok = this.status >= 200 && this.status < 300;
    }
    async text() {
      return String(this._body || '');
    }
    async json() {
      return JSON.parse(await this.text());
    }
  }
  globalThis.Response = Response;
}

// console polyfill (V8 may not have it by default in deno_core)
if (typeof globalThis.console === 'undefined') {
  globalThis.console = {
    log: function(...args) {
      Deno.core.print(args.map(String).join(' ') + '\n');
    },
    error: function(...args) {
      Deno.core.print('[ERROR] ' + args.map(String).join(' ') + '\n');
    },
    warn: function(...args) {
      Deno.core.print('[WARN] ' + args.map(String).join(' ') + '\n');
    },
    info: function(...args) {
      Deno.core.print('[INFO] ' + args.map(String).join(' ') + '\n');
    },
    debug: function(...args) {
      // No-op for debug
    }
  };
}
