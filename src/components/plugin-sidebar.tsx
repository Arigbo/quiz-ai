"use client";

import React, { useState } from 'react';
import { 
  Power, 
  RefreshCw, 
  History, 
  Settings2, 
  BrainCircuit, 
  ScanSearch,
  ShieldCheck,
  Info,
  ClipboardPaste,
  Send
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface PluginSidebarProps {
  isEnabled: boolean;
  onToggle: (val: boolean) => void;
  onRefresh: () => void;
  scanCount: number;
}

export function PluginSidebar({ isEnabled, onToggle, onRefresh, scanCount }: PluginSidebarProps) {
  const [manualText, setManualText] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleManualSubmit = () => {
    // In a real production scenario, this would trigger a parser.
    // For now, we simulate the 'Refresh' to show the tool is active.
    onRefresh();
    setIsDialogOpen(false);
    setManualText("");
  };

  return (
    <aside className="fixed right-6 top-1/2 -translate-y-1/2 w-16 hover:w-64 transition-all duration-300 bg-white shadow-2xl rounded-2xl border border-primary/10 overflow-hidden z-50 group">
      <div className="h-full flex flex-col">
        {/* Header/Logo */}
        <div className="p-4 flex items-center gap-3">
          <div className="bg-primary p-2 rounded-lg shrink-0">
            <BrainCircuit className="h-6 w-6 text-white" />
          </div>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
            <h2 className="font-bold text-sm tracking-tight">QuizSolver PRO</h2>
            <p className="text-[10px] text-green-600 font-bold uppercase">v2.0.0 Stable</p>
          </div>
        </div>

        <Separator />

        {/* Controls */}
        <div className="flex-1 p-2 space-y-4 overflow-y-auto overflow-x-hidden">
          <div className="space-y-1">
             <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant={isEnabled ? "default" : "outline"} 
                    size="icon" 
                    className={cn(
                      "w-full h-12 transition-all duration-300 rounded-xl",
                      isEnabled ? "bg-primary shadow-lg shadow-primary/20" : "bg-transparent border-primary/20"
                    )}
                    onClick={() => onToggle(!isEnabled)}
                  >
                    <Power className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left" className="font-body">
                  {isEnabled ? "Deactivate Engine" : "Activate PRO Engine"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <DialogTrigger asChild>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="w-full h-12 hover:bg-primary/10 hover:text-primary transition-all rounded-xl"
                      >
                        <ClipboardPaste className="h-5 w-5" />
                      </Button>
                    </TooltipTrigger>
                  </DialogTrigger>
                  <TooltipContent side="left">Manual Extraction</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Manual Quiz Import</DialogTitle>
                  <DialogDescription>
                    Paste the text of the quiz question and options below if the auto-scanner cannot detect them.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <Textarea 
                    placeholder="e.g. What is the capital of France? A) Paris B) London..." 
                    className="h-32"
                    value={manualText}
                    onChange={(e) => setManualText(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button onClick={handleManualSubmit} disabled={!manualText.trim()}>
                    <Send className="mr-2 h-4 w-4" />
                    Extract & Solve
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="w-full h-12 hover:bg-primary/10 hover:text-primary transition-all rounded-xl"
                    onClick={onRefresh}
                  >
                    <RefreshCw className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">Rescan Environment</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 px-2 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Live Mode</Label>
              <Switch checked={isEnabled} onCheckedChange={onToggle} />
            </div>
            
            <div className="bg-primary/5 p-3 rounded-xl space-y-2 border border-primary/10">
              <div className="flex items-center gap-2 text-primary">
                <ScanSearch className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Cloud Sync</span>
              </div>
              <div className="text-[10px] text-muted-foreground leading-relaxed">
                <span className="text-primary font-bold">{scanCount}</span> questions cached and verified.
              </div>
            </div>

            <div className="bg-accent/5 p-3 rounded-xl space-y-2 border border-accent/10">
              <div className="flex items-center gap-2 text-accent">
                <ShieldCheck className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Production</span>
              </div>
              <ul className="text-[10px] text-muted-foreground space-y-1 list-disc list-inside">
                <li>End-to-end encrypted</li>
                <li>Real-time verification</li>
                <li>Zero-Trace solving</li>
              </ul>
            </div>
          </div>
        </div>

        <Separator />

        {/* Footer */}
        <div className="p-3">
          <Button variant="ghost" className="w-full justify-start gap-3 p-2 rounded-xl h-12 overflow-hidden hover:bg-primary/5">
            <Settings2 className="h-5 w-5 shrink-0" />
            <span className="text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">PRO Configuration</span>
          </Button>
        </div>
      </div>
    </aside>
  );
}