"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { PluginSidebar } from '@/components/plugin-sidebar';
import { QuizItem } from '@/components/quiz-item';
import { mockQuiz, QuizQuestion } from '@/app/lib/quiz-data';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Globe, ChevronLeft, ChevronRight, Lock, Shield, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { extractQuizClient as extractQuiz } from '@/lib/ai-client';
import { useToast } from '@/hooks/use-toast';

function QuizContent() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [isExtensionMode, setIsExtensionMode] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[]>(mockQuiz);
  const [solvedCount, setSolvedCount] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);

  useEffect(() => {
    if (searchParams.get('mode') === 'extension') {
      setIsExtensionMode(true);
      setIsEnabled(true);
    }

    const handleMessage = async (event: MessageEvent) => {
      // Allow messages from the extension bridge (sidepanel.js)
      if (event.data.type === 'TAB_CONTENT_RESPONSE') {
        setIsCapturing(true);
        try {
          const result = await extractQuiz({ 
            rawText: event.data.payload.text,
            url: event.data.payload.url 
          });
          setQuestions(result.questions);
          setSolvedCount(0);
          setProgress(0);
          toast({
            title: "Page Scanned Successfully",
            description: `Identified ${result.questions.length} questions from the active tab.`,
          });
        } catch (err: any) {
          toast({
            variant: "destructive",
            title: "Analysis Failed",
            description: "Could not identify questions on this page. Try manual extraction.",
          });
        } finally {
          setIsCapturing(false);
        }
      } else if (event.data.type === 'TAB_CONTENT_ERROR') {
        toast({
          variant: "destructive",
          title: "Capture Error",
          description: event.data.message || "Failed to read tab content.",
        });
        setIsCapturing(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [searchParams, toast]);

  const handleRefresh = () => {
    setSolvedCount(0);
    setProgress(0);
    setQuestions(mockQuiz);
  };

  const onSolveResult = () => {
    setSolvedCount(prev => {
      const next = prev + 1;
      setProgress((next / questions.length) * 100);
      return next;
    });
  };

  const handleQuestionsFound = (newQuestions: QuizQuestion[]) => {
    setQuestions(newQuestions);
    setSolvedCount(0);
    setProgress(0);
    setIsEnabled(true);
  };

  const handleRequestCapture = () => {
    setIsCapturing(true);
    // Notify the sidepanel.js bridge to scan the tab
    window.parent.postMessage({ type: 'REQUEST_TAB_CONTENT' }, '*');
  };

  return (
    <div className="h-screen flex flex-col bg-background selection:bg-accent/30">
      {!isExtensionMode && (
        <header className="h-14 border-b bg-white flex items-center px-4 gap-4 z-20 shadow-sm">
          <div className="flex gap-1.5 shrink-0">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <div className="w-3 h-3 rounded-full bg-yellow-400" />
            <div className="w-3 h-3 rounded-full bg-green-400" />
          </div>
          <div className="flex gap-2 shrink-0">
            <ChevronLeft className="h-5 w-5 text-muted-foreground cursor-pointer hover:text-foreground" />
            <ChevronRight className="h-5 w-5 text-muted-foreground cursor-pointer hover:text-foreground" />
          </div>
          <div className="flex-1 max-w-2xl bg-muted/50 h-9 rounded-full flex items-center px-4 gap-2 border">
            <Lock className="h-3.5 w-3.5 text-green-500" />
            <span className="text-sm text-muted-foreground truncate">https://secure.exam-portal.io/test/live-session-active</span>
          </div>
          <div className="flex items-center gap-4">
            <Globe className="h-5 w-5 text-muted-foreground" />
            <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-[10px] font-bold text-primary">JD</div>
          </div>
        </header>
      )}

      <main className="flex-1 flex overflow-hidden relative">
        <div className={cn(
          "flex-1 flex flex-col overflow-hidden bg-slate-50/50",
          isExtensionMode ? "p-4" : "p-8 lg:p-12"
        )}>
          <div className={cn("max-w-4xl mx-auto w-full", isExtensionMode ? "mb-6" : "mb-12")}>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200">
                <Shield className="w-3 h-3 mr-1" />
                {isExtensionMode ? "Extension Active" : "Production Session"}
              </Badge>
              <Badge variant="outline" className="border-accent/30 text-accent">v2.0.0 Stable</Badge>
              {isCapturing && (
                <Badge variant="default" className="bg-accent text-white animate-pulse">
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Capturing...
                </Badge>
              )}
            </div>
            <h1 className={cn(
              "font-black tracking-tight mb-2 text-slate-900",
              isExtensionMode ? "text-xl" : "text-4xl"
            )}>
              {questions === mockQuiz ? "Exam Assistant" : "Live Session"}
            </h1>
            
            <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400">
                <span>Solving Progress</span>
                <span>{solvedCount} / {questions.length}</span>
              </div>
              <Progress value={progress} className="h-2 bg-slate-100" />
            </div>
          </div>

          <ScrollArea className="flex-1 max-w-4xl mx-auto w-full">
            <div className={cn("space-y-4", isExtensionMode ? "pb-24" : "pb-32")}>
              {questions.map((q, idx) => (
                <QuizItem 
                  key={q.id} 
                  data={q} 
                  index={idx}
                  isActive={isEnabled}
                  autoSolve={isEnabled}
                  onSolve={onSolveResult}
                />
              ))}
              {questions.length === 0 && (
                <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
                  <p className="text-slate-400 text-sm font-medium">Use the sidebar to scan a quiz or import text.</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <PluginSidebar 
          isEnabled={isEnabled} 
          onToggle={setIsEnabled} 
          onRefresh={handleRefresh}
          scanCount={questions.length}
          onQuestionsFound={handleQuestionsFound}
          isExtensionMode={isExtensionMode}
          onRequestCapture={handleRequestCapture}
          isCapturing={isCapturing}
        />
      </main>

      {!isExtensionMode && (
        <footer className="h-10 border-t bg-white px-6 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground shrink-0 z-20">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span>System: Online</span>
            </div>
            <Separator orientation="vertical" className="h-4" />
            <span>AI Model: Gemini 2.5 Flash</span>
          </div>
          <div className="flex items-center gap-4">
            <span>© 2024 QuizSolver PRO</span>
          </div>
        </footer>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="h-screen flex flex-col items-center justify-center bg-background gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-medium text-muted-foreground animate-pulse">Initializing Solver...</p>
      </div>
    }>
      <QuizContent />
    </Suspense>
  );
}