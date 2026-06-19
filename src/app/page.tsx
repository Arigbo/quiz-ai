"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { PluginSidebar } from '@/components/plugin-sidebar';
import { QuizItem } from '@/components/quiz-item';
import { mockQuiz, QuizQuestion } from '@/app/lib/quiz-data';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Globe, ChevronLeft, ChevronRight, Lock, Shield, Loader2, CheckCircle2, BookOpen, ScanEye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { extractQuizClient as extractQuiz, autoAnswerClient } from '@/lib/ai-client';
import { useToast } from '@/hooks/use-toast';

// ─── SkillsBridge Answer Panel ────────────────────────────────────────────────
// When questions are scanned from SkillsBridge, we resolve all answers in
// parallel and display them in a compact cheat-sheet format for fast review.

type SolvedQuestion = {
  question: string;
  options: string[];
  correctAnswer: string;
  correctAnswerIndex: number;
  type: 'radio' | 'checkbox';
};

function SkillsBridgeAnswerPanel({ questions, onDone }: {
  questions: QuizQuestion[];
  onDone: () => void;
}) {
  const [solved, setSolved] = useState<(SolvedQuestion | null)[]>(
    Array(questions.length).fill(null)
  );
  const [isResolving, setIsResolving] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    setIsResolving(true);

    // Resolve all questions in parallel (with a small stagger to avoid rate limits)
    const resolveAll = async () => {
      const results: (SolvedQuestion | null)[] = Array(questions.length).fill(null);

      await Promise.all(
        questions.map(async (q, idx) => {
          // Small stagger: 300ms between each to avoid hitting rate limits
          await new Promise(r => setTimeout(r, idx * 350));
          if (cancelled) return;
          try {
            const answer = await autoAnswerClient({ question: q.question, options: q.options });
            if (!cancelled) {
              results[idx] = {
                question: q.question,
                options: q.options,
                correctAnswer: answer.correctAnswer,
                correctAnswerIndex: answer.correctAnswerIndex,
                type: q.type,
              };
              setSolved(prev => {
                const next = [...prev];
                next[idx] = results[idx];
                return next;
              });
            }
          } catch {
            // Leave as null on error
          }
        })
      );

      if (!cancelled) {
        setIsResolving(false);
        const resolvedCount = results.filter(Boolean).length;
        toast({
          title: `✅ ${resolvedCount}/${questions.length} Questions Solved`,
          description: 'Scroll down to see all answers.',
        });
      }
    };

    void resolveAll();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions]);

  const doneCount = solved.filter(Boolean).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold text-slate-800">SkillsBridge Answers</span>
          </div>
          {isResolving ? (
            <Badge variant="default" className="bg-accent text-white text-[10px] animate-pulse gap-1">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              Solving {doneCount}/{questions.length}
            </Badge>
          ) : (
            <Badge variant="default" className="bg-green-600 text-white text-[10px] gap-1">
              <CheckCircle2 className="h-2.5 w-2.5" />
              Done
            </Badge>
          )}
        </div>
        <Progress value={(doneCount / questions.length) * 100} className="h-1.5 bg-slate-100" />
      </div>

      {/* Answer list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-3 py-3 space-y-3 pb-24">
          {questions.map((q, idx) => {
            const s = solved[idx];
            return (
              <div
                key={q.id}
                className={cn(
                  "rounded-xl border p-3 transition-all duration-300",
                  s
                    ? "bg-white border-green-200 shadow-sm"
                    : "bg-slate-50 border-slate-200 animate-pulse"
                )}
              >
                {/* Question */}
                <p className="text-[11px] font-bold text-slate-400 mb-1 uppercase tracking-wider">
                  Q{idx + 1}
                </p>
                <p className="text-[12px] font-medium text-slate-700 leading-snug mb-2 line-clamp-3">
                  {q.question}
                </p>

                {/* Options */}
                <div className="space-y-1">
                  {q.options.map((opt, oi) => {
                    const isAnswer = s ? s.correctAnswerIndex === oi : false;
                    return (
                      <div
                        key={oi}
                        className={cn(
                          "flex items-start gap-2 px-2 py-1.5 rounded-lg text-[11px] transition-colors",
                          isAnswer
                            ? "bg-green-50 border border-green-300 font-semibold text-green-800"
                            : "text-slate-500"
                        )}
                      >
                        <span className={cn(
                          "shrink-0 flex h-4 w-4 items-center justify-center rounded-full border text-[9px] font-bold mt-0.5",
                          isAnswer ? "border-green-500 bg-green-500 text-white" : "border-slate-300 text-slate-400"
                        )}>
                          {String.fromCharCode(65 + oi)}
                        </span>
                        <span className="leading-tight">{opt}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Loading state */}
                {!s && (
                  <div className="mt-2 h-4 bg-slate-200 rounded animate-pulse w-3/4" />
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Footer action */}
      <div className="px-4 py-3 border-t border-slate-100 shrink-0">
        <button
          onClick={onDone}
          className="w-full text-[11px] font-semibold text-slate-500 hover:text-primary transition-colors py-1"
        >
          ← Back to normal mode
        </button>
      </div>
    </div>
  );
}

// ─── Main Quiz Content ─────────────────────────────────────────────────────────

function QuizContent() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [isExtensionMode, setIsExtensionMode] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[]>(mockQuiz);
  const [solvedCount, setSolvedCount] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);

  // SkillsBridge fast-answer mode
  const [sbQuestions, setSbQuestions] = useState<QuizQuestion[] | null>(null);

  useEffect(() => {
    if (searchParams.get('mode') === 'extension') {
      setIsExtensionMode(true);
      setIsEnabled(true);
    }

    const handleMessage = async (event: MessageEvent) => {
      if (event.data.type === 'TAB_CONTENT_RESPONSE') {
        setIsCapturing(true);
        const payload = event.data.payload;

        try {
          // ── SkillsBridge structured shortcut ─────────────────────────────
          // If sidepanel.js already parsed structured questions, skip AI extraction
          // and go straight to the answer panel.
          if (
            payload.source === 'skillsbridge_structured' &&
            Array.isArray(payload.questions) &&
            payload.questions.length > 0
          ) {
            const parsed: QuizQuestion[] = payload.questions.map(
              (q: { questionText: string; options: string[] }, i: number) => ({
                id: `sb_q${i + 1}`,
                question: q.questionText,
                options: q.options,
                type: 'radio' as const,
              })
            );
            setSbQuestions(parsed);
            toast({
              title: `📚 ${parsed.length} Questions Detected`,
              description: 'SkillsBridge quiz found — solving all answers now...',
            });
            setIsCapturing(false);
            return;
          }

          // ── Generic AI extraction ────────────────────────────────────────
          const result = await extractQuiz({
            rawText: payload.text,
            url: payload.url,
          });
          setQuestions(result.questions as QuizQuestion[]);
          setSolvedCount(0);
          setProgress(0);
          setIsEnabled(true);
          toast({
            title: "Page Scanned Successfully",
            description: `Identified ${result.questions.length} questions from the active tab.`,
          });
        } catch {
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
    setSbQuestions(null);
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
    setSbQuestions(null);
  };

  const handleRequestCapture = () => {
    setIsCapturing(true);
    window.parent.postMessage({ type: 'REQUEST_TAB_CONTENT' }, '*');
  };

  // ── SkillsBridge fast-answer panel (extension mode only) ──────────────────
  if (isExtensionMode && sbQuestions && sbQuestions.length > 0) {
    return (
      <div className="h-screen flex flex-col bg-background">
        <SkillsBridgeAnswerPanel
          questions={sbQuestions}
          onDone={() => setSbQuestions(null)}
        />
        {/* Floating scan button */}
        <button
          onClick={handleRequestCapture}
          disabled={isCapturing}
          className="fixed bottom-20 right-4 z-50 flex items-center gap-1.5 rounded-full bg-primary text-white px-3 py-2 text-[11px] font-bold shadow-lg shadow-primary/30 hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {isCapturing
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <ScanEye className="h-3.5 w-3.5" />}
          Scan again
        </button>
      </div>
    );
  }

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