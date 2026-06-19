"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QuizQuestion } from '@/app/lib/quiz-data';
import { autoAnswerQuizQuestion, AutoAnswerQuizQuestionOutput } from '@/ai/flows/auto-answer-quiz-question';
import { useToast } from '@/hooks/use-toast';

interface QuizItemProps {
  data: QuizQuestion;
  isActive: boolean;
  autoSolve: boolean;
  onSolve: (result: AutoAnswerQuizQuestionOutput) => void;
  index: number;
}

export function QuizItem({ data, isActive, autoSolve, onSolve, index }: QuizItemProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [answer, setAnswer] = useState<AutoAnswerQuizQuestionOutput | null>(null);
  const [selectedValue, setSelectedValue] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (isActive && autoSolve && !answer && !isAnalyzing) {
      // Stagger AI requests to prevent rate limit (5 RPM for Gemini Flash Free Tier)
      const staggerDelay = index * 2500; 
      const timer = setTimeout(() => {
        handleSolve();
      }, staggerDelay);
      
      return () => clearTimeout(timer);
    }
  }, [isActive, autoSolve, index, answer]);

  const handleSolve = async () => {
    setIsAnalyzing(true);
    try {
      const result = await autoAnswerQuizQuestion({
        question: data.question,
        options: data.options
      });
      setAnswer(result);
      
      // Auto-select functionality
      setTimeout(() => {
        setSelectedValue(result.correctAnswerIndex.toString());
        onSolve(result);
      }, 800);
      
    } catch (error: any) {
      console.error("AI Error:", error);
      // Surface quota issues specifically
      if (error.message?.includes("429") || error.message?.includes("quota") || error.message?.includes("RESOURCE_EXHAUSTED")) {
        toast({
          variant: "destructive",
          title: "AI Rate Limit Reached",
          description: "You've exceeded the Gemini API quota. Please wait a moment before trying again.",
        });
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="relative group mb-8">
      {/* Detection Border Overlay */}
      <div className={cn(
        "absolute -inset-2 rounded-xl transition-all duration-500 pointer-events-none border-2 border-transparent",
        isActive && "border-primary/20 bg-primary/[0.02] shadow-sm",
        isAnalyzing && "border-accent/40 bg-accent/[0.05] animate-detecting"
      )} />

      <Card className={cn(
        "border-none shadow-none bg-white/50 backdrop-blur-sm relative z-10",
        isActive && "ring-1 ring-primary/20"
      )}>
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-lg font-semibold leading-tight pr-8">
              {data.question}
            </h3>
            {isAnalyzing && (
              <Badge variant="outline" className="flex items-center gap-1.5 text-accent border-accent/30 animate-pulse">
                <Loader2 className="h-3 w-3 animate-spin" />
                Analyzing
              </Badge>
            )}
            {answer && (
              <Badge variant="outline" className="flex items-center gap-1.5 text-primary border-primary/30">
                <CheckCircle2 className="h-3 w-3" />
                Verified
              </Badge>
            )}
          </div>

          <div className="space-y-4">
            {data.type === 'radio' ? (
              <RadioGroup 
                value={selectedValue || ""} 
                onValueChange={setSelectedValue}
                className="grid gap-3"
              >
                {data.options.map((option, idx) => (
                  <div 
                    key={idx} 
                    className={cn(
                      "flex items-center space-x-3 p-3 rounded-lg border transition-all",
                      selectedValue === idx.toString() ? "bg-primary/5 border-primary/30" : "border-transparent bg-background/40 hover:bg-background/80"
                    )}
                  >
                    <RadioGroupItem value={idx.toString()} id={`${data.id}-${idx}`} />
                    <Label 
                      htmlFor={`${data.id}-${idx}`} 
                      className={cn(
                        "flex-1 cursor-pointer",
                        answer?.correctAnswerIndex === idx && "text-primary font-semibold"
                      )}
                    >
                      {option}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            ) : (
              <div className="grid gap-3">
                {data.options.map((option, idx) => (
                  <div key={idx} className="flex items-center space-x-3 p-3 rounded-lg border border-transparent bg-background/40">
                    <Checkbox id={`${data.id}-${idx}`} />
                    <Label htmlFor={`${data.id}-${idx}`} className="flex-1 cursor-pointer">{option}</Label>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Answer Overlay */}
      {answer && (
        <div className="answer-overlay flex flex-col gap-1 min-w-[180px]">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-3.5 w-3.5" />
            <span className="text-[10px] uppercase tracking-wider font-bold opacity-80">AI Suggestion</span>
          </div>
          <p className="text-sm">{answer.correctAnswer}</p>
        </div>
      )}
    </div>
  );
}
