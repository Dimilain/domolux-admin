import '@testing-library/jest-dom';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock next-auth
jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: null,
    status: 'unauthenticated',
  }),
  signIn: jest.fn(),
  signOut: jest.fn(),
}));

// Mock environment variables
process.env.NEXT_PUBLIC_STRAPI_API_URL = 'http://localhost:1337';
process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET = 'test-uploads';

// Mock Next.js server components
global.Request = class Request {
  constructor(public input: RequestInfo | URL, public init?: RequestInit) {}
  headers = new Headers();
  method = 'GET';
  url = '';
  body = null;
  json = jest.fn();
  text = jest.fn();
  formData = jest.fn();
} as any;

global.Response = class Response {
  constructor(public body?: BodyInit | null, public init?: ResponseInit) {}
  headers = new Headers();
  status = 200;
  statusText = 'OK';
  ok = true;
  json = jest.fn();
  text = jest.fn();
} as any;

