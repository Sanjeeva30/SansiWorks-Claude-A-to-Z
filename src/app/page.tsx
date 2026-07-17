"use client";
import React from "react";
import { StoreProvider, useStore } from "@/lib/store";
import { UIProvider, useUI } from "@/lib/ui";
import { Sidebar } from "@/components/sidebar";
import { HomeSection } from "@/components/home-section";
import { ListSection } from "@/components/list-section";
import { CompanySection } from "@/components/company-section";
import { WorkspaceSection } from "@/components/workspace-section";
import { TaskDetailSlideOver } from "@/components/task-detail";
import { QuickAddModal } from "@/components/quick-add";
import { ProfileModal, MetricModal, Toasts } from "@/components/shared";
import { CommandPalette, PublicPortal } from "@/components/palette-portal";
import { OnboardingChecklist } from "@/components/onboarding";

function AppShell() {
  const { section } = useUI();
  const { loading, me } = useStore();

  if (loading || !me) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 14, background: "var(--sw-page)" }}>
        <div style={{ display: "flex", width: 38, height: 5, borderRadius: 99, overflow: "hidden" }}>
          <span style={{ flex: 1, background: "#7A0D20" }} /><span style={{ flex: 1, background: "#22409E" }} /><span style={{ flex: 1, background: "#0D4F31" }} /><span style={{ flex: 1, background: "#F3263E" }} /><span style={{ flex: 1, background: "#BDDA5F" }} />
        </div>
        <span style={{ fontSize: 12.5, color: "var(--sw-muted)", fontFamily: "var(--font-sans)" }}>Loading your workspace…</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%", background: "var(--sw-page)", fontFamily: "var(--font-sans)", color: "var(--sw-text)", overflow: "hidden" }}>
      <Sidebar />
      {section === "home" && <HomeSection />}
      {section === "list" && <ListSection />}
      {section === "company" && <CompanySection />}
      {section === "workspace" && <WorkspaceSection />}

      <TaskDetailSlideOver />
      <QuickAddModal />
      <ProfileModal />
      <MetricModal />
      <CommandPalette />
      <PublicPortal />
      <OnboardingChecklist />
      <Toasts />
    </div>
  );
}

export default function Page() {
  return (
    <StoreProvider>
      <UIProvider>
        <AppShell />
      </UIProvider>
    </StoreProvider>
  );
}
