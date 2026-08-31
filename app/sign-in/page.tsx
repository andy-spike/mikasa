import { redirect } from "next/navigation";

/** One provider, one button, and it lives on the landing. */
export default function SignIn() {
  redirect("/");
}
