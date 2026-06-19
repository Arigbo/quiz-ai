"use client";

import React, { useState } from 'react';
import { PluginSidebar } from '@/components/plugin-sidebar';
import { QuizItem } from '@/components/quiz-item';
import { mockQuiz } from '@/app/lib/quiz-data';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Globe, ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';

export default function Home() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [solvedCount, setSolvedCount] = useState(0);
  const [progress, setProgress] = useState(0);

  const handleRefresh = () => {
    setSolvedCount(0);
    setProgress(0);
  };

  const onSolveResult = () => {
    setSolvedCount(prev => {
      const next = prev + 1;
      setProgress((next / mockQuiz.length) * 100);
      return next;
    });
  };

  return (
    <div className="h-screen flex flex-col bg-background selection:bg-accent/30">
      {/* Simulated Browser Navbar */}
      <header className="h-14 border-b bg-white flex items-center px-4 gap-4 z-20">
        <div className="flex gap-1.5 shrink-0">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <div className="w-3 h-3 rounded-full bg-yellow-400" />
          <div className="w-3 h-3 rounded-full bg-green-400" />
        </div>
        <div className="flex gap-2 shrink-0">
          <ChevronLeft className="h-5 w-5 text-muted-foreground" />
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 max-w-2xl bg-muted/50 h-9 rounded-full flex items-center px-4 gap-2 border">
          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">https://education-portal.testing/quiz/react-advanced</span>
        </div>
        <div className="flex items-center gap-4">
          <Globe className="h-5 w-5 text-muted-foreground" />
          <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-[10px] font-bold text-primary">JD</div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 flex flex-col p-8 lg:p-12 overflow-hidden">
          {/* Quiz Header */}
          <div className="max-w-4xl mx-auto w-full mb-12">
            <div className="flex items-center gap-3 mb-4">
              <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">Examination Mode</Badge>
              <Badge variant="outline" className="border-accent/30 text-accent">Timed: 20m</Badge>
            </div>
            <h1 className="text-4xl font-black tracking-tight mb-4">Advanced React Patterns & Ecosystem</h1>
            <p className="text-muted-foreground text-lg mb-8">Test your knowledge of the modern React and Next.js ecosystem. Answer all questions to proceed.</p>
            
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-muted-foreground">
                <span>Quiz Progress</span>
                <span>{solvedCount} of {mockQuiz.length} Automated</span>
              </div>
              <Progress value={progress} className="h-2 bg-white/50 border border-black/5" />
            </div>
          </div>

          <ScrollArea className="flex-1 max-w-4xl mx-auto w-full">
            <div className="pb-32">
              {mockQuiz.map((q, idx) => (
                <QuizItem 
                  key={q.id} 
                  data={q} 
                  index={idx}
                  isActive={isEnabled}
                  autoSolve={isEnabled}
                  onSolve={onSolveResult}
                />
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Plugin UI Overlay Component */}
        <PluginSidebar 
          isEnabled={isEnabled} 
          onToggle={setIsEnabled} 
          onRefresh={handleRefresh}
          scanCount={mockQuiz.length}
        />
      </main>

      {/* Floating Status Bar */}
      <footer className="h-10 border-t bg-white px-6 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground shrink-0 z-20">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span>AI Core: Connected</span>
          </div>
          <Separator orientation="vertical" className="h-4" />
          <span>Latency: 42ms</span>
        </div>
        <div className="flex items-center gap-4">
          <span>Plugin Mode: Testing</span>
          <Separator orientation="vertical" className="h-4" />
          <span>Developer: QuizSolver AI</span>
        </div>
      </footer>
    </div>
  );
}
