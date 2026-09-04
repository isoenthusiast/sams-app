import "next-auth";

declare module "next-auth" {
  interface User {
    role?: string;
    providerRole?: string | null;
    // SAMS-012: force-password-change flag carried from the credentials authorize
    // result into the JWT (so the middleware can gate a must-change user).
    mustChangePassword?: boolean;
  }
  interface Session {
    user: {
      id?: string;
      role?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      providerRole?: string | null;
      // SAMS-012: exposed so middleware/proxy can force a change-password redirect.
      mustChangePassword?: boolean;
    };
  }
}
