import { redirect } from "next/navigation";

/** Signing in for the first time is the account creation. */
export default function SignUp() {
  redirect("/");
}
