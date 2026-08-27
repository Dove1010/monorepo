"use client";

import { useState } from "react";
import { CheckCircle2, Building2 } from "lucide-react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";

interface BankAccountCardProps {
  bankName: string;
  accountNumber: string;
  accountName: string;
  onChangeRequest: () => void;
}

export function BankAccountCard({
  bankName,
  accountNumber,
  accountName,
  onChangeRequest,
}: BankAccountCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Mask account number to show only last 4 digits
  const maskedAccountNumber =
    accountNumber.length >= 4
      ? `****${accountNumber.slice(-4)}`
      : "****1234"; // Default fallback

  const handleConfirmChange = () => {
    setIsModalOpen(false);
    onChangeRequest();
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">{bankName}</h3>
            <p className="text-sm font-medium text-muted-foreground">
              {accountName}
            </p>
            <div className="mt-1 flex items-center space-x-2">
              <span className="text-sm font-mono text-foreground">
                {maskedAccountNumber}
              </span>
              <span className="inline-flex items-center space-x-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                <CheckCircle2 className="h-3 w-3" />
                <span>Verified</span>
              </span>
            </div>
          </div>
        </div>

        <AlertDialog.Root open={isModalOpen} onOpenChange={setIsModalOpen}>
          <AlertDialog.Trigger asChild>
            <button className="text-sm font-medium text-primary hover:underline">
              Change Account
            </button>
          </AlertDialog.Trigger>
          <AlertDialog.Portal>
            <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
            <AlertDialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg">
              <AlertDialog.Title className="text-lg font-semibold">
                Are you sure?
              </AlertDialog.Title>
              <AlertDialog.Description className="text-sm text-muted-foreground">
                Pending payouts will use the new account. Are you sure you want to change your primary bank account?
              </AlertDialog.Description>
              <div className="flex justify-end space-x-2 pt-4">
                <AlertDialog.Cancel asChild>
                  <button className="rounded-md px-4 py-2 text-sm font-medium border hover:bg-muted transition-colors">
                    Cancel
                  </button>
                </AlertDialog.Cancel>
                <AlertDialog.Action asChild>
                  <button
                    onClick={handleConfirmChange}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    Yes, Change Account
                  </button>
                </AlertDialog.Action>
              </div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      </div>
    </div>
  );
}
