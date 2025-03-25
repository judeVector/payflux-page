"use client";

import React, { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { clusterApiUrl } from "@solana/web3.js";
import { Clock, PlusCircle, CheckCircle2, ArrowRight, XCircle, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { useCluster } from "../cluster/cluster-data-access";
import { getPayfluxProgramId } from "program/payflux-exports";

import { atomWithStorage } from "jotai/utils";
import { useAtom } from "jotai";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { Cluster } from "@solana/web3.js";

// Define our activity types
export type ActivityType = "create" | "approve" | "payment" | "cancel" | "unknown";

export interface Activity {
  id: string;
  type: ActivityType;
  workflowName: string;
  timestamp: Date;
  user: string;
  amount?: number;
  explorerPath?: string;
}

// Atom to store activities locally
const localActivitiesAtom = atomWithStorage<Activity[]>("local-activities", []);
// Atom to store when the feed was last cleared (as a timestamp)
const lastClearedAtom = atomWithStorage<number>("last-cleared-activities", 0);

// Helper function: returns a friendly status string for an activity type.
function getActivityStatusText(activity: Activity): string {
  switch (activity.type) {
    case "create":
      return "Workflow Initialized";
    case "approve":
      return "Workflow Approved";
    case "payment":
      return "Payment Executed";
    case "cancel":
      return "Workflow Cancelled";
    default:
      return "Activity";
  }
}

export function useActivityFeed() {
  const { connection } = useConnection();
  const { cluster } = useCluster();
  const network = WalletAdapterNetwork.Devnet;
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);

  // Derive the program ID using the current cluster's network string.
  // const programId = useMemo(() => {
  //   const network = typeof cluster.network === "string" ? cluster.network : "devnet";
  //   return getPayfluxProgramId(clusterApiUrl(network));
  // }, [cluster]);

  const programId = useMemo(() => getPayfluxProgramId(endpoint as Cluster), [cluster]);

  return useQuery<Activity[]>({
    queryKey: ["payflux", "activities", { cluster }],
    queryFn: async () => {
      // Fetch recent transaction signatures (limit to 20 for this example)
      const signatures = await connection.getSignaturesForAddress(programId, {
        limit: 20,
      });

      // For each signature, fetch the transaction and extract data.
      const activities = await Promise.all(
        signatures.map(async (sigInfo) => {
          const tx = await connection.getTransaction(sigInfo.signature);
          const timestamp = new Date((sigInfo.blockTime || Date.now()) * 1000);
          let activityType: ActivityType = "unknown";
          let workflowName = "";
          let amount = 0;
          let user = "";
          let explorerPath = "";

          if (tx?.meta?.logMessages) {
            const logs = tx.meta.logMessages.join(" ");
            // Parse logs for events – you can refine this parsing based on your log format.
            if (logs.includes("InitializeWorkflow")) {
              activityType = "create";
              workflowName = "Workflow Initialized";
            } else if (logs.includes("ApproveWorkflow")) {
              activityType = "approve";
              workflowName = "Workflow Approved";
            } else if (logs.includes("ExecutePayment")) {
              activityType = "payment";
              workflowName = "Payment Executed";
              // Optionally, extract amount details from logs if available.
            } else if (logs.includes("CancelWorkflow")) {
              activityType = "cancel";
              workflowName = "Workflow Cancelled";
            }

            // Use the first account key as the user (adjust if needed)
            if (tx.transaction.message.accountKeys.length > 0) {
              user = tx.transaction.message.accountKeys[0].toString();
            }
            // Set the explorer path (using the transaction signature)
            explorerPath = `tx/${sigInfo.signature}`;
          }

          return {
            id: sigInfo.signature,
            type: activityType,
            workflowName,
            timestamp,
            user,
            amount,
            explorerPath,
          };
        })
      );
      return activities;
    },
    // Refetch every minute (optional)
    refetchInterval: 60000,
  });
}

export function ActivityFeed() {
  const { data: fetchedActivities, isLoading, error } = useActivityFeed();
  const { getExplorerUrl } = useCluster();
  const { publicKey } = useWallet(); // Get connected wallet address
  const [localActivities, setLocalActivities] = useAtom(localActivitiesAtom);
  const [lastCleared, setLastCleared] = useAtom(lastClearedAtom);

  // Convert wallet publicKey to a string (if connected)
  const connectedUser = publicKey ? publicKey.toBase58() : null;

  // Filter activities to only show those belonging to the connected user
  const userActivities = useMemo(() => {
    if (!connectedUser) return []; // No wallet connected, show nothing
    return localActivities.filter((act) => act.user === connectedUser);
  }, [localActivities, connectedUser]);

  // Merge fetched activities with local storage activities
  useEffect(() => {
    if (fetchedActivities && fetchedActivities.length > 0) {
      const filteredFetched = fetchedActivities.filter(
        (act) => act.user === connectedUser && new Date(act.timestamp).getTime() > lastCleared
      );
      const filteredLocal = localActivities.filter(
        (act) => act.user === connectedUser && new Date(act.timestamp).getTime() > lastCleared
      );

      // Merge and remove duplicates
      const merged = [
        ...filteredFetched,
        ...filteredLocal.filter((act) => !filteredFetched.some((newAct) => newAct.id === act.id)),
      ];

      merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setLocalActivities(merged);
    }
  }, [fetchedActivities, lastCleared, localActivities, connectedUser, setLocalActivities]);

  // Handler to clear only the connected user's activities
  const handleClearActivities = () => {
    if (connectedUser) {
      const filteredActivities = localActivities.filter((act) => act.user !== connectedUser);
      setLocalActivities(filteredActivities);
      setLastCleared(Date.now());
    }
  };

  if (!connectedUser) {
    return (
      <div className="flex flex-col items-center justify-center h-64 p-8">
        <p className="text-sm text-muted-foreground">Connect your wallet to view activity.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-sm text-muted-foreground">Loading activity feed…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-sm text-muted-foreground">Error loading activity feed.</p>
      </div>
    );
  }

  if (!userActivities || userActivities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 p-8">
        <Clock className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">No recent activity</h3>
        <p className="text-sm text-muted-foreground text-center mt-2">
          Activity will appear here once you start using PayFlux.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-4">
        <h2 className="text-xl font-bold">Your Activity</h2>
        <Button variant="destructive" size="sm" onClick={handleClearActivities}>
          <Trash2 className="h-4 w-4" />
          <span className="ml-2">Clear All</span>
        </Button>
      </div>
      <div className="border rounded-lg divide-y">
        {userActivities.map((activity) => (
          <div
            key={activity.id}
            className="p-4 hover:bg-muted/50 flex flex-col md:flex-row items-start md:items-center justify-between"
          >
            <div className="flex items-start gap-3">
              <div className="mt-1">
                {activity.type === "create" && (
                  <div className="rounded-full bg-blue-500/10 p-1">
                    <PlusCircle className="h-4 w-4 text-blue-500" />
                  </div>
                )}
                {activity.type === "approve" && (
                  <div className="rounded-full bg-green-500/10 p-1">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  </div>
                )}
                {activity.type === "payment" && (
                  <div className="rounded-full bg-purple-500/10 p-1">
                    <ArrowRight className="h-4 w-4 text-purple-500" />
                  </div>
                )}
                {activity.type === "cancel" && (
                  <div className="rounded-full bg-red-500/10 p-1">
                    <XCircle className="h-4 w-4 text-red-500" />
                  </div>
                )}
                {activity.type === "unknown" && (
                  <div className="rounded-full bg-gray-500/10 p-1">
                    <Clock className="h-4 w-4 text-gray-500" />
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-medium">{getActivityStatusText(activity)}</p>
                <p className="text-sm text-muted-foreground">{activity.workflowName}</p>
                <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                  <span>{activity.timestamp.toLocaleString()}</span>
                </div>
              </div>
            </div>
            <div className="mt-2 md:mt-0">
              {activity.explorerPath && (
                <a
                  href={getExplorerUrl(activity.explorerPath)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  View on Explorer
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
