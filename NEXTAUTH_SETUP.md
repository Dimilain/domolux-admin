# NextAuth Configuration with Strapi

## Overview

The admin panel uses NextAuth.js with a Credentials provider to authenticate users against the Strapi backend.

## Authentication Flow

1. User enters credentials on `/login` page
2. NextAuth calls Strapi `/api/auth/local` endpoint
3. Strapi returns JWT token and user data
4. NextAuth stores JWT in secure httpOnly cookie
5. JWT is available in session for API calls

## Configuration

### Environment Variables

Create `.env.local` in the project root:

```env
# Strapi API URL
NEXT_PUBLIC_STRAPI_API_URL=http://localhost:1337

# NextAuth Secret (generate with: openssl rand -base64 32)
NEXTAUTH_SECRET=your-secret-key-here

# NextAuth URL (for production)
NEXTAUTH_URL=http://localhost:3000
```

### Generate NEXTAUTH_SECRET

```bash
openssl rand -base64 32
```

Or use Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Authentication Endpoints

### Login Page

- **Route:** `/login`
- **Component:** `app/login/page.tsx`
- **Features:**
  - Email/username and password fields
  - Form validation with react-hook-form
  - Password visibility toggle
  - Error message display
  - Loading state during authentication

### NextAuth API Route

- **Route:** `/api/auth/[...nextauth]`
- **File:** `app/api/auth/[...nextauth]/route.ts`
- **Provider:** Credentials provider
- **Strapi Endpoint:** `${STRAPI_URL}/api/auth/local`

## Protected Routes

### Middleware

- **File:** `middleware.ts`
- **Function:** Protects all routes except `/login` and `/api/auth`
- **Behavior:**
  - Redirects unauthenticated users to `/login`
  - Redirects authenticated users away from `/login` to dashboard
  - Preserves callback URL for redirect after login

### Protected Pages

All pages except `/login` require authentication. The middleware automatically:
- Checks for valid JWT token
- Redirects to login if not authenticated
- Allows access if authenticated

## Session Management

### JWT Storage

- JWT is stored in NextAuth session (secure httpOnly cookie)
- Session token name: `next-auth.session-token`
- Cookie settings:
  - `httpOnly: true` - Prevents XSS attacks
  - `sameSite: 'lax'` - CSRF protection
  - `secure: true` in production - HTTPS only

### Session Duration

- Default: 30 days
- Configurable in `authOptions.session.maxAge`

### Accessing JWT in API Calls

```typescript
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const jwt = (session?.user as any)?.jwt;

  // Use JWT for Strapi API calls
  const response = await fetch(`${STRAPI_URL}/api/products`, {
    headers: {
      'Authorization': `Bearer ${jwt}`,
    },
  });
}
```

## User Roles

Strapi user roles are stored in the session:

```typescript
const session = await getServerSession(authOptions);
const userRole = (session?.user as any)?.role; // 'Admin', 'Curator', etc.
```

## Testing Authentication

### 1. Create Test User in Strapi

1. Start Strapi: `cd backend && npm run develop`
2. Access admin panel: `http://localhost:1337/admin`
3. Go to: **Content Manager** → **Users**
4. Create a new user or use existing admin account

### 2. Test Login Flow

1. Start admin panel: `cd domolux-admin && npm run dev`
2. Navigate to: `http://localhost:3000/login`
3. Enter credentials:
   - **Email/Username:** Your Strapi user email or username
   - **Password:** Your Strapi user password
4. Click "Sign in"
5. Should redirect to dashboard if successful

### 3. Test Protected Routes

1. Try accessing `/products` without logging in
2. Should redirect to `/login`
3. After login, should redirect back to `/products`

## Error Handling

### Common Errors

1. **"Invalid email/username or password"**
   - Check credentials are correct
   - Verify user exists in Strapi
   - Check user is not blocked

2. **"Your account has been blocked"**
   - User account is blocked in Strapi
   - Contact administrator

3. **"Please confirm your email address"**
   - User email not confirmed
   - Confirm email in Strapi or disable confirmation requirement

4. **"Network Error"**
   - Strapi backend not running
   - Check `NEXT_PUBLIC_STRAPI_API_URL` is correct
   - Verify CORS is configured in Strapi

## Security Considerations

1. **JWT Storage**
   - JWT stored in httpOnly cookie (prevents XSS)
   - Secure flag enabled in production (HTTPS only)

2. **Session Management**
   - Sessions expire after 30 days
   - Logout clears session cookie

3. **CSRF Protection**
   - SameSite cookie attribute prevents CSRF
   - NextAuth handles CSRF tokens automatically

4. **Password Security**
   - Passwords never sent to frontend
   - Only sent to Strapi for authentication
   - Strapi handles password hashing

## Troubleshooting

### Issue: Login redirects but not authenticated

**Solution:**
- Check `NEXTAUTH_SECRET` is set
- Verify `NEXTAUTH_URL` matches your domain
- Check browser console for errors
- Verify session cookie is being set

### Issue: Strapi authentication fails

**Solution:**
- Verify Strapi is running
- Check `NEXT_PUBLIC_STRAPI_API_URL` is correct
- Verify CORS allows admin panel origin
- Check Strapi logs for errors

### Issue: Middleware not protecting routes

**Solution:**
- Verify `middleware.ts` is in project root
- Check middleware matcher configuration
- Ensure NextAuth secret is set
- Check Next.js logs for middleware errors

## Next Steps

1. **Add Role-Based Access Control**
   - Check user role in middleware
   - Restrict routes based on role
   - Show/hide UI elements based on role

2. **Add Token Refresh**
   - Implement token refresh logic
   - Handle expired tokens gracefully

3. **Add Remember Me**
   - Extend session duration for "remember me" option
   - Store preference in cookie

4. **Add Password Reset**
   - Create password reset flow
   - Integrate with Strapi password reset


