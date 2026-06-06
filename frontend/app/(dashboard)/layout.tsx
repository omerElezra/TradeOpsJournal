import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { RangeProvider } from "@/components/range-context";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RangeProvider>
      <Sidebar />
      <div className="md:pl-60">
        <Topbar />
        <main className="mx-auto max-w-screen-2xl p-6">{children}</main>
      </div>
    </RangeProvider>
  );
}
