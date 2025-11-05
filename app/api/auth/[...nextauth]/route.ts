import NextAuth, { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import axios from 'axios';

const STRAPI_URL = process.env.NEXT_PUBLIC_STRAPI_API_URL || 'http://localhost:1337';

interface StrapiAuthResponse {
  jwt: string;
  user: {
    id: number;
    username: string;
    email: string;
    provider: string;
    confirmed: boolean;
    blocked: boolean;
    role: {
      id: number;
      name: string;
      type: string;
      description: string;
    };
  };
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        identifier: { label: 'Email or Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.identifier || !credentials?.password) {
          throw new Error('Please enter your email/username and password');
        }

        try {
          // Authenticate with Strapi
          const response = await axios.post<StrapiAuthResponse>(
            `${STRAPI_URL}/api/auth/local`,
            {
              identifier: credentials.identifier,
              password: credentials.password,
            },
            {
              headers: {
                'Content-Type': 'application/json',
              },
            }
          );

          const { jwt, user } = response.data;

          // Check if user is blocked
          if (user.blocked) {
            throw new Error('Your account has been blocked. Please contact an administrator.');
          }

          // Check if user is confirmed (if required)
          if (!user.confirmed) {
            throw new Error('Please confirm your email address before signing in.');
          }

          // Return user object for NextAuth session
          return {
            id: user.id.toString(),
            email: user.email,
            name: user.username,
            jwt, // Store JWT in user object
            role: user.role?.name || 'Public',
          };
        } catch (error: any) {
          // Handle Strapi authentication errors
          if (axios.isAxiosError(error)) {
            const message =
              error.response?.data?.error?.message ||
              error.response?.data?.message ||
              'Invalid email/username or password';
            throw new Error(message);
          }
          throw error;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Initial sign in - store JWT and user data
      if (user) {
        token.jwt = (user as any).jwt;
        token.id = user.id;
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      // Add JWT and user data to session
      if (session.user) {
        (session.user as any).jwt = token.jwt;
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET,
  cookies: {
    sessionToken: {
      name: 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
};

export default NextAuth(authOptions);



