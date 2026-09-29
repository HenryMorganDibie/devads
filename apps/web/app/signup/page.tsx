import { redirect } from "next/navigation";

// Developer accounts are created by signing in with GitHub or Google on /join.
export default function SignupPage() {
  redirect("/join");
}
