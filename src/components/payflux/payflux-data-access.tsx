"use client";

import { Program } from "@coral-xyz/anchor";
import {
  getPayfluxProgram,
  getPayfluxProgramId,
  Payflux,
  PayfluxIDL,
} from "program/payflux-exports";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Cluster, clusterApiUrl, PublicKey } from "@solana/web3.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import toast from "react-hot-toast";
import { useCluster } from "../cluster/cluster-data-access";
import { useAnchorProvider } from "../providers/wallet-provider";
import { useTransactionToast } from "../ui/ui-layout";
import { BN } from "@coral-xyz/anchor";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import axios from "axios";

const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

// Interface for Workflow Initialization Arguments
interface InitializeWorkflowArgs {
  workflowId: string;
  totalDeposit: number;
  transferAmount: number;
  interval: number;
  approvalsRequired: number;
  authorizedApprovers: PublicKey[];
  receiver: PublicKey;
}

// Interface for Automation Data Sent to the Backend
interface AutomationData {
  workflowId: string;
  workflowPDA: string;
  interval: number;
  nextExecutionTime: number;
  creator: string;
  receiver: string;
  totalDeposit: number;
  transferAmount: number;
  isActive: boolean;
}

const API_ENDPOINT =
  process.env.NEXT_PUBLIC_AUTOMATION_API || "http://localhost:3001/api/automations";

// Main Hook to Interact with Payflux Program
export function usePayfluxProgram() {
  const { connection } = useConnection();
  const network = WalletAdapterNetwork.Devnet;
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);
  const { cluster } = useCluster();
  const transactionToast = useTransactionToast();
  const provider = useAnchorProvider();
  const programId = useMemo(() => getPayfluxProgramId(endpoint as Cluster), [cluster]);
  const program = new Program<Payflux>(PayfluxIDL, provider);

  const { publicKey } = useWallet();
  const queryClient = useQueryClient();

  // Fetch All Payment Workflows
  const accounts = useQuery({
    queryKey: ["payflux", "all", { cluster }],
    queryFn: () => program.account.paymentWorkflow.all(),
  });

  // Filter Workflows for Connected Wallet and Approvers
  const filteredAccounts = useMemo(() => {
    if (!publicKey || !accounts.data) return [];
    return accounts.data.filter((workflow) => {
      const isCreator = workflow.account.creator.toString() === publicKey.toString();
      const isApprover = workflow.account.authorizedApprovers.some(
        (approver) => approver.toString() === publicKey.toString()
      );
      return isCreator || isApprover;
    });
  }, [accounts.data, publicKey]);

  // Fetch Program Account Info
  const getProgramAccount = useQuery({
    queryKey: ["get-program-account", { cluster }],
    queryFn: () => connection.getParsedAccountInfo(programId),
  });

  // Initialize a New Workflow
  const initializeWorkflow = useMutation<string, Error, InitializeWorkflowArgs>({
    mutationKey: ["initializeWorkflow", "create", { cluster }],
    mutationFn: async ({
      workflowId,
      totalDeposit,
      transferAmount,
      interval,
      approvalsRequired,
      authorizedApprovers,
      receiver,
    }) => {
      const transferAmountBN = new BN(transferAmount);
      const totalDepositBN = new BN(totalDeposit);
      const intervalBN = new BN(interval);

      return program.methods
        .initializeWorkflow(
          workflowId,
          totalDepositBN,
          transferAmountBN,
          intervalBN,
          approvalsRequired,
          authorizedApprovers,
          receiver
        )
        .accounts({
          usdcMint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
    },
    onSuccess: (signature) => {
      transactionToast(signature);
      queryClient.invalidateQueries({ queryKey: ["payflux", "all", { cluster }] });
    },
    onError: (error) => toast.error(`Error initializing workflow: ${error.message}`),
  });

  // Approve a Workflow
  const approveWorkflow = useMutation<string, Error, { workflowPDA: PublicKey }>({
    mutationKey: ["approveWorkflow", { cluster }],
    mutationFn: async ({ workflowPDA }) =>
      program.methods
        .approveWorkflow()
        .accounts({
          approver: provider.wallet.publicKey,
          workflow: workflowPDA,
        })
        .rpc(),
    onSuccess: (signature) => {
      transactionToast(signature);
      accounts.refetch();
    },
    onError: (error) => toast.error(`Error approving workflow: ${error.message}`),
  });

  // Cancel a Workflow
  const cancelWorkflow = useMutation<string, Error, { workflowPDA: PublicKey }>({
    mutationKey: ["cancelWorkflow", { cluster }],
    mutationFn: async ({ workflowPDA }) =>
      program.methods
        .cancelWorkflow()
        .accounts({
          creator: provider.wallet.publicKey,
          // @ts-ignore
          workflow: workflowPDA,
          usdcMint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc(),
    onSuccess: (signature) => {
      transactionToast(signature);
      accounts.refetch();
    },
    onError: (error) => toast.error(`Error canceling workflow: ${error.message}`),
  });

  // Execute a Payment
  const executePayment = useMutation<string, Error, { workflowPDA: PublicKey }>({
    mutationKey: ["executePayment", { cluster }],
    mutationFn: async ({ workflowPDA }) => {
      const workflowData = await program.account.paymentWorkflow.fetch(workflowPDA);
      const [workflowTokenAccount] = PublicKey.findProgramAddressSync(
        [workflowPDA.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), USDC_MINT.toBuffer()],
        TOKEN_PROGRAM_ID
      );
      const receiverTokenAccount = await getAssociatedTokenAddress(
        USDC_MINT,
        workflowData.receiver
      );

      return program.methods
        .executePayment()
        .accounts({
          // @ts-ignore
          workflow: workflowPDA,
          receiver: workflowData.receiver,
          creator: workflowData.creator,
          workflowTokenAccount,
          receiverTokenAccount,
          usdcMint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
    },
    onSuccess: (signature) => {
      transactionToast(signature);
      queryClient.invalidateQueries({ queryKey: ["payflux", "all", { cluster }] });
    },
    onError: (error) => toast.error(`Error executing payment: ${error.message}`),
  });

  // Start Automation
  const startAutomation = useMutation<string, Error, { workflowPDA: PublicKey; interval: number }>({
    mutationKey: ["startAutomation", { cluster }],
    mutationFn: async ({ workflowPDA, interval }) => {
      const workflowData = await program.account.paymentWorkflow.fetch(workflowPDA);
      const nextExecutionTime = workflowData.nextPayment.toNumber();

      const automationData: AutomationData = {
        workflowId: workflowData.workflowId,
        workflowPDA: workflowPDA.toString(),
        interval,
        nextExecutionTime,
        creator: workflowData.creator.toString(),
        receiver: workflowData.receiver.toString(),
        totalDeposit: workflowData.totalDeposit.toNumber(),
        transferAmount: workflowData.transferAmount.toNumber(),
        isActive: workflowData.active,
      };

      const response = await axios.post(API_ENDPOINT, automationData, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await getAuthToken()}`,
        },
      });

      if (!response.data.success)
        throw new Error(`Failed to register automation: ${response.data.message}`);
      return response.data.automationId;
    },
    onSuccess: (automationId) => {
      transactionToast(`Automation registered: ${automationId}`);
      toast.success("Payment automation successfully scheduled");
      queryClient.invalidateQueries({ queryKey: ["payflux", "all", { cluster }] });
    },
    onError: (error) => toast.error(`Error starting automation: ${error.message}`),
  });

  // Toggle Automation (Pause/Resume)
  const toggleAutomation = useMutation<
    string,
    Error,
    { workflowPDA: PublicKey; isActive: boolean }
  >({
    mutationKey: ["toggleAutomation", { cluster }],
    mutationFn: async ({ workflowPDA, isActive }) => {
      const workflowData = await program.account.paymentWorkflow.fetch(workflowPDA);
      const response = await axios.patch(
        `${API_ENDPOINT}/${workflowData.workflowId}`,
        { isActive },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${await getAuthToken()}`,
          },
        }
      );

      if (!response.data.success)
        throw new Error(`Failed to ${isActive ? "resume" : "pause"} automation`);
      return response.data.automationId;
    },
    onSuccess: (automationId, variables) =>
      toast.success(`Automation ${variables.isActive ? "resumed" : "paused"} successfully`),
    onError: (error, variables) =>
      toast.error(
        `Failed to ${variables.isActive ? "resume" : "pause"} automation: ${error.message}`
      ),
  });

  // Helper: Get Authentication Token
  // async function getAuthToken() {
  //   const message = `Authenticate-Automation-${Date.now()}`;
  //   const signature = await provider.wallet.signMessage(new TextEncoder().encode(message));
  //   return Buffer.from(signature).toString("base64");
  // }

  async function getAuthToken() {
    const message = `Authenticate-Automation-${Date.now()}`;
    const signature = await (provider.wallet as any).signMessage(new TextEncoder().encode(message));
    return Buffer.from(signature).toString("base64");
  }

  return {
    program,
    programId,
    accounts: { ...accounts, data: filteredAccounts },
    getProgramAccount,
    initializeWorkflow,
    approveWorkflow,
    cancelWorkflow,
    executePayment,
    startAutomation,
    toggleAutomation,
  };
}

// Hook for Specific Payflux Account
export function usePayfluxProgramAccount({ account }: { account: PublicKey }) {
  const { cluster } = useCluster();
  const transactionToast = useTransactionToast();
  const { program, startAutomation, accounts } = usePayfluxProgram();
  const queryClient = useQueryClient();

  // Fetch Specific Account Data
  const accountQuery = useQuery({
    queryKey: ["payflux", "fetch", { cluster, account }],
    queryFn: () => program.account.paymentWorkflow.fetch(account),
  });

  // Approve Specific Workflow
  const approveWorkflow = useMutation<string, Error, void>({
    mutationKey: ["approveWorkflow", { cluster, account }],
    mutationFn: async () =>
      program.methods
        .approveWorkflow()
        .accounts({
          approver: program.provider.publicKey,
          workflow: account,
        })
        .rpc(),
    onSuccess: (signature) => {
      transactionToast(signature);
      queryClient.invalidateQueries({ queryKey: ["payflux", "all", { cluster }] });
      queryClient.invalidateQueries({ queryKey: ["payflux", "fetch", { cluster, account }] });

      // queryClient.invalidateQueries(["payflux", "all", { cluster }]);
      // queryClient.invalidateQueries(["payflux", "fetch", { cluster, account }]);
    },
    onError: (error) => toast.error(`Error approving workflow: ${error.message}`),
  });

  // Cancel Specific Workflow
  const cancelWorkflow = useMutation<string, Error, void>({
    mutationKey: ["cancelWorkflow", { cluster, account }],
    mutationFn: async () =>
      program.methods
        .cancelWorkflow()
        .accounts({
          creator: program.provider.publicKey,
          usdcMint: USDC_MINT,
          // @ts-ignore
          workflow: account,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc(),
    onSuccess: (signature) => {
      transactionToast(signature);
      // queryClient.invalidateQueries(["payflux", "all", { cluster }]);
      // queryClient.invalidateQueries(["payflux", "fetch", { cluster, account }]);

      queryClient.invalidateQueries({ queryKey: ["payflux", "all", { cluster }] });
      queryClient.invalidateQueries({ queryKey: ["payflux", "fetch", { cluster, account }] });
    },
    onError: (error) => toast.error(`Error canceling workflow: ${error.message}`),
  });

  // Execute Payment for Specific Workflow
  const executePayment = useMutation<string, Error, void>({
    mutationKey: ["executePayment", { cluster, account }],
    mutationFn: async () => {
      const workflowData = await program.account.paymentWorkflow.fetch(account);
      const [workflowTokenAccount] = PublicKey.findProgramAddressSync(
        [account.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), USDC_MINT.toBuffer()],
        TOKEN_PROGRAM_ID
      );
      const receiverTokenAccount = await getAssociatedTokenAddress(
        USDC_MINT,
        workflowData.receiver
      );

      return program.methods
        .executePayment()
        .accounts({
          // @ts-ignore
          workflow: account,
          receiver: workflowData.receiver,
          creator: workflowData.creator,
          workflowTokenAccount,
          receiverTokenAccount,
          usdcMint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
    },
    onSuccess: (signature) => {
      transactionToast(signature);
      accounts.refetch();
    },
    onError: (error) => toast.error(`Error executing payment: ${error.message}`),
  });

  return {
    accountQuery,
    approveWorkflow,
    cancelWorkflow,
    executePayment,
    startAutomation,
  };
}

// Helper: Get Associated Token Address
async function getAssociatedTokenAddress(mint: PublicKey, owner: PublicKey): Promise<PublicKey> {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    TOKEN_PROGRAM_ID
  )[0];
}
