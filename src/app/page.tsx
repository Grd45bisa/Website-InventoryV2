import { redirect } from "next/navigation";

// Halaman awal mengarah ke Dasbor sesuai sitemap (RPD.md 6.1).
export default function Home() {
  redirect("/dashboard");
}
