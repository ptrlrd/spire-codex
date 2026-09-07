import type { Metadata } from "next";
import UsersClient from "./UsersClient";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminUsersPage() {
  return <UsersClient />;
}
