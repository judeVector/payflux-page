import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
          Automated Payment Workflows on Solana
        </h1>
        <p className="mt-6 text-lg leading-8 text-muted-foreground">
          Create, manage, and execute automated payment streams with multi-signature approval
          workflows. Perfect for team salaries, contractor payments, and recurring transactions.
        </p>
        <div className="mt-10 flex items-center justify-center gap-x-6">
          <Link href="https://app.payflux.xyz/" target="_blank" rel="noopener noreferrer">
            <Button size="lg" className="gap-2">
              Launch App
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
