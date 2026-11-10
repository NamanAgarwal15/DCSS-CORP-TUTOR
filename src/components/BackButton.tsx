import Link from "next/link";

/**
 * "← Back" link to the page's parent. It links to a fixed parent route rather
 * than calling history.back(), so it always works — even when the page was
 * opened directly from a shared link with no history to go back to.
 */
export default function BackButton({ href = "/", label = "Back" }: { href?: string; label?: string }) {
  return (
    <Link href={href} className="inline-block text-sm text-blue-600 hover:underline">
      ← {label}
    </Link>
  );
}
