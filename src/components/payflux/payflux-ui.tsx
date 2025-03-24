"use client";

import { useState } from "react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  PlusCircle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Clock,
  Wallet,
  Users,
  AlertTriangle,
} from "lucide-react";
import { usePayfluxProgram, usePayfluxProgramAccount } from "./payflux-data-access";
import { ExplorerLink } from "../cluster/cluster-ui";
import { ellipsify } from "../ui/ui-layout";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Separator } from "../ui/separator";
import { Progress } from "../ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { toast } from "react-hot-toast";

// Import the new ActivityFeed component from a separate file
import { ActivityFeed } from "./activity-feed";

export function PayfluxDashboard() {
  const [activeTab, setActiveTab] = useState("workflows");

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">PayFlux Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Manage your payment workflows and transactions
            </p>
          </div>
          <CreateWorkflowDialog />
        </div>

        <Tabs
          defaultValue="workflows"
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full"
        >
          <TabsList className="grid grid-cols-2 md:w-[400px]">
            <TabsTrigger value="workflows">Payment Workflows</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
          <TabsContent value="workflows" className="mt-6">
            <WorkflowList />
          </TabsContent>
          <TabsContent value="activity" className="mt-6">
            <ActivityFeed />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function CreateWorkflowDialog() {
  const { initializeWorkflow } = usePayfluxProgram();
  const { publicKey } = useWallet();
  const [open, setOpen] = useState(false);
  const [workflowId, setWorkflowId] = useState("");
  const [totalDeposit, setTotalDeposit] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [interval, setInterval] = useState("");
  const [approvalsRequired, setApprovalsRequired] = useState("1");
  const [approverInput, setApproverInput] = useState("");
  const [approvers, setApprovers] = useState<string[]>([]);
  const [receiver, setReceiver] = useState("");

  const handleAddApprover = () => {
    try {
      new PublicKey(approverInput);
      if (!approvers.includes(approverInput)) {
        setApprovers([...approvers, approverInput]);
        setApproverInput("");
      } else {
        toast.error("Approver already added");
      }
    } catch (error) {
      toast.error("Invalid public key");
    }
  };

  const handleRemoveApprover = (approver: string) => {
    setApprovers(approvers.filter((a) => a !== approver));
  };

  const handleSubmit = async () => {
    if (
      !workflowId ||
      !totalDeposit ||
      !transferAmount ||
      !interval ||
      !approvalsRequired ||
      !receiver
    ) {
      toast.error("Please fill all required fields");
      return;
    }

    if (workflowId.length > 32) {
      toast.error("Workflow ID must be 32 characters or fewer");
      return;
    }

    const totalDepositValue = Number.parseFloat(totalDeposit);
    const amountValue = Number.parseFloat(transferAmount);

    if (totalDepositValue < amountValue) {
      toast.error("Initial deposit must be at least the transfer amount");
      return;
    }

    try {
      const approverPublicKeys = approvers.map((a) => new PublicKey(a));
      const receiverPubkey = new PublicKey(receiver);

      await initializeWorkflow.mutateAsync({
        workflowId,
        totalDeposit: totalDepositValue * 1e6, // Convert to atomic units (USDC has 6 decimals)
        transferAmount: amountValue * 1e6,
        interval: Number.parseInt(interval) * 60,
        approvalsRequired: Number.parseInt(approvalsRequired),
        authorizedApprovers: approverPublicKeys,
        receiver: receiverPubkey,
      });

      setOpen(false);
      resetForm();
    } catch (error) {
      console.error("Error creating workflow:", error);
    }
  };

  const resetForm = () => {
    setWorkflowId("");
    setTotalDeposit("");
    setTransferAmount("");
    setInterval("");
    setApprovalsRequired("1");
    setApproverInput("");
    setApprovers([]);
    setReceiver("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {publicKey && (
        <DialogTrigger asChild>
          <Button className="gap-2">
            <PlusCircle className="h-4 w-4" />
            Create Workflow
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Payment Workflow</DialogTitle>
          <DialogDescription>
            Set up a new automated payment workflow with custom parameters.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="workflowId">Workflow Name</Label>
            <Input
              id="workflowId"
              placeholder="e.g., Team Salary Q2"
              value={workflowId}
              onChange={(e) => setWorkflowId(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="totalDeposit">Initial Deposit (USDC)</Label>
              <Input
                id="totalDeposit"
                type="number"
                placeholder="0.00"
                value={totalDeposit}
                onChange={(e) => setTotalDeposit(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="amount">Transfer Amount (USDC)</Label>
              <Input
                id="amount"
                type="number"
                placeholder="0.00"
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="interval">Interval (minutes)</Label>
            <Input
              id="interval"
              type="number"
              placeholder="60"
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="receiver">Receiver Address</Label>
            <Input
              id="receiver"
              placeholder="Receiver's Solana wallet address"
              value={receiver}
              onChange={(e) => setReceiver(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="approvalsRequired">Approvals Required</Label>
            <Input
              id="approvalsRequired"
              type="number"
              min="1"
              placeholder="1"
              value={approvalsRequired}
              onChange={(e) => setApprovalsRequired(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Authorized Approvers</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Approver public key"
                value={approverInput}
                onChange={(e) => setApproverInput(e.target.value)}
              />
              <Button type="button" variant="outline" onClick={handleAddApprover}>
                Add
              </Button>
            </div>
            {approvers.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {approvers.map((approver) => (
                  <Badge key={approver} variant="secondary" className="flex items-center gap-1">
                    {ellipsify(approver)}
                    <XCircle
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => handleRemoveApprover(approver)}
                    />
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={initializeWorkflow.isPending}>
            {initializeWorkflow.isPending ? "Creating..." : "Create Workflow"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WorkflowList() {
  const { accounts, getProgramAccount } = usePayfluxProgram();

  if (getProgramAccount.isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-sm text-muted-foreground">Loading program account...</p>
        </div>
      </div>
    );
  }

  if (!getProgramAccount.data?.value) {
    return (
      <div className="flex flex-col items-center justify-center h-64 border border-dashed rounded-lg p-8">
        <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
        <h3 className="text-lg font-medium">Program not found</h3>
        <p className="text-sm text-muted-foreground text-center mt-2">
          Make sure you have deployed the program and are connected to the correct cluster.
        </p>
      </div>
    );
  }

  if (accounts.isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-sm text-muted-foreground">Loading workflows...</p>
        </div>
      </div>
    );
  }

  if (!accounts.data?.length) {
    return (
      <div className="flex flex-col items-center justify-center h-64 border border-dashed rounded-lg p-8">
        <div className="rounded-full bg-primary/10 p-3 mb-4">
          <PlusCircle className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-lg font-medium">No workflows found</h3>
        <p className="text-sm text-muted-foreground text-center mt-2">
          Connect and Create your first payment workflow to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      {accounts.data.map((account) => (
        <WorkflowCard key={account.publicKey.toString()} account={account.publicKey} />
      ))}
    </div>
  );
}

function WorkflowCard({ account }: { account: PublicKey }) {
  const { accountQuery, approveWorkflow, cancelWorkflow, executePayment, startAutomation } =
    usePayfluxProgramAccount({ account });
  const { publicKey } = useWallet();

  if (accountQuery.isLoading || !accountQuery.data) return null;

  const workflow = accountQuery.data;
  const isCreator = publicKey?.toString() === workflow.creator.toString();
  const isApprover = workflow.authorizedApprovers.some(
    (approver) => publicKey?.toString() === approver.toString()
  );
  const hasApproved = workflow.approvals
    .slice(0, workflow.approvalsReceived)
    .some((approverPubkey) => publicKey?.toString() === approverPubkey.toString());
  const isFullyApproved = workflow.approvalsReceived >= workflow.approvalsRequired;

  const intervalInSeconds = workflow.interval.toNumber();
  const intervalInMinutes = Math.floor(workflow.interval.toNumber() / 60);
  const approvalProgress = (workflow.approvalsReceived / workflow.approvalsRequired) * 100;
  const intervalPlural = intervalInMinutes === 1 ? "min" : "mins";

  // Calculate the next payment timestamp
  const nextPaymentTimestamp: any = workflow.nextPayment;
  const lastExecuted = workflow.nextPayment ? new Date(nextPaymentTimestamp * 1000) : new Date();
  const nextPayment = new Date(lastExecuted.getTime() + intervalInSeconds * 1000);
  const nextPaymentTime = nextPayment.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Card className="overflow-hidden border-2 hover:border-primary/50 transition-all">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="flex items-center gap-2">
              {workflow.workflowId}
              {isFullyApproved && (
                <Badge variant="success" className="ml-2">
                  Approved
                </Badge>
              )}
            </CardTitle>
            <CardDescription>Created by {ellipsify(workflow.creator.toString())}</CardDescription>
          </div>
          <Badge variant="outline" className="font-mono">
            {(workflow.totalDeposit.toNumber() / 1e6).toFixed(2)} USDC
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pb-2">
        <div className="space-y-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {/* Interval: {workflow.interval.toNumber() / 60} min */}
              Interval: {intervalInMinutes} {intervalPlural}
            </span>
            <span className="text-muted-foreground flex items-center gap-1">
              <Users className="h-4 w-4" />
              {/* Approvals: {workflow.approvalsReceived}/{workflow.approvalsRequired} */}
              Approvals: {workflow.approvalsReceived}/{workflow.approvalsRequired}
            </span>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-sm font-medium">
              <span>Approval Progress</span>
              <span>{Math.round(approvalProgress)}%</span>
            </div>
            <Progress value={approvalProgress} className="h-2" />
            <div className="text-sm text-muted-foreground">Next payment: {nextPaymentTime}</div>
          </div>

          <Separator />

          <div className="text-sm">
            <div className="font-medium mb-1">Authorized Approvers</div>
            <div className="flex flex-wrap gap-2">
              {workflow.authorizedApprovers
                .filter(
                  (approver) =>
                    // Filter out the system program address
                    !approver.equals(SystemProgram.programId) &&
                    // Filter out any null or undefined values
                    approver.toString() !== "11111111111111111111111111111111"
                )
                .map((approver, index) => (
                  <Badge key={index} variant="secondary">
                    {ellipsify(approver.toString())}
                  </Badge>
                ))}
            </div>
          </div>

          <div className="text-sm">
            <div className="font-medium mb-1">Workflow ID</div>
            <ExplorerLink path={`account/${account}`} label={ellipsify(account.toString())} />
          </div>
        </div>
      </CardContent>
      <CardFooter className="pt-4 flex flex-wrap gap-2">
        {isApprover && !hasApproved && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => approveWorkflow.mutateAsync()}
            disabled={approveWorkflow.isPending}
          >
            <CheckCircle2 className="h-4 w-4" />
            {approveWorkflow.isPending ? "Approving..." : "Approve"}
          </Button>
        )}
        {isCreator && (
          <>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1"
              onClick={() => cancelWorkflow.mutateAsync()}
              disabled={cancelWorkflow.isPending}
            >
              <XCircle className="h-4 w-4" />
              {cancelWorkflow.isPending ? "Canceling..." : "Cancel"}
            </Button>
            {isFullyApproved && (
              <>
                <Button
                  size="sm"
                  className="gap-1"
                  onClick={() => executePayment.mutateAsync()}
                  disabled={executePayment.isPending}
                >
                  <ArrowRight className="h-4 w-4" />
                  {executePayment.isPending ? "Executing..." : "Execute Manually"}
                </Button>
                <Button
                  size="sm"
                  className="gap-1"
                  onClick={() =>
                    startAutomation.mutateAsync({
                      workflowPDA: account,
                      interval: workflow.interval.toNumber(),
                    })
                  }
                  disabled={startAutomation.isPending}
                >
                  <Clock className="h-4 w-4" />
                  {startAutomation.isPending ? "Starting..." : "Start Automation"}
                </Button>
              </>
            )}
          </>
        )}
      </CardFooter>
    </Card>
  );
}
