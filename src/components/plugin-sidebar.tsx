"use client";

import React from 'react';
import { 
  Power, 
  RefreshCw, 
  History, 
  Settings2, 
  BrainCircuit, 
  ScanSearch,
  ChevronRight,
  ShieldCheck
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

interface PluginSidebarProps {
  isEnabled: boolean;
  onToggle: (val: boolean) => void;
  onRefresh: () => void;
  scanCount: number;
}

export function PluginSidebar({ isEnabled, onToggle, onRefresh, scanCount }: PluginSidebarProps) {
  return (
    <aside className="fixed right-6 top-1/2 -translate-y-1/2 w-16 hover:w-64 transition-all duration-300 bg-white shadow-2xl rounded-2xl border border-primary/10 overflow-hidden z-50 group">
      <div className="h-full flex flex-col">
        {/* Header/Logo */}
        <div className="p-4 flex items-center gap-3">
          <div className="bg-primary p-2 rounded-lg shrink-0">
            <BrainCircuit className="h-6 w-6 text-white" />
          </div>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
            <h2 className="font-bold text-sm tracking-tight">QuizSolver AI</h2>
            <p className="text-[10px] text-muted-foreground uppercase">v1.2.4 Active</p>
          </div>
        </div>

        <Separator />

        {/* Controls */}
        <div className="flex-1 p-2 space-y-4">
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
                  {isEnabled ? "Disable Plugin" : "Enable Plugin"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

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
                <TooltipContent side="left">Refresh Page Scan</TooltipContent>
              </Tooltip>
            </TooltipProvider>

             <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="w-full h-12 hover:bg-primary/10 hover:text-primary transition-all rounded-xl"
                  >
                    <History className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">Solving History</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 px-2 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Auto-Select</Label>
              <Switch checked={isEnabled} onCheckedChange={onToggle} />
            </div>
            
            <div className="bg-primary/5 p-3 rounded-xl space-y-2 border border-primary/10">
              <div className="flex items-center gap-2 text-primary">
                <ScanSearch className="h-4 w-4" />
                <span className="text-xs font-bold">Scanning</span>
              </div>
              <div className="text-[10px] text-muted-foreground">
                Current page contains <span className="text-primary font-bold">{scanCount}</span> solvable elements.
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Footer */}
        <div className="p-3">
          <Button variant="ghost" className="w-full justify-start gap-3 p-2 rounded-xl h-12 overflow-hidden hover:bg-primary/5">
            <Settings2 className="h-5 w-5 shrink-0" />
            <span className="text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">Global Settings</span>
          </Button>
          <div className="mt-2 flex items-center justify-center group-hover:justify-start gap-3 p-2">
            <ShieldCheck className="h-5 w-5 text-accent shrink-0" />
            <span className="text-[10px] font-bold text-accent opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-widest">Secure Core</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
