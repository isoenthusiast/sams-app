import "next-auth";

declare module "next-auth" {
  interface User {
    role?: string;
    providerRole?: string | null;
  }
  interface Session {
    user: {
      id?: string;
      role?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      providerRole?: string | null;
    };
  }
}
