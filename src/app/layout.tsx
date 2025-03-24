import type React from "react";
import "@/styles/globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { ClusterProvider } from "@/components/cluster/cluster-data-access";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { SolanaProvider } from "@/components/providers/wallet-provider";
import { QueryClientProvider } from "@/components/providers/query-provider";
import { Header } from "@/components/layout/header";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PayFlux | Automated Payment Workflows on Solana",
  description: "Create, manage, and execute automated payment workflows on Solana",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <QueryClientProvider>
            <ClusterProvider>
              <SolanaProvider>
                <div className="min-h-screen bg-background">
                  <Header />
                  {children}
                </div>
                <Toaster position="bottom-right" />
              </SolanaProvider>
            </ClusterProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
