import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { ArrowUp, Bot, FileText, Link as LinkIcon, Paperclip, SquarePen, User, AlertCircle, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  status?: "sending" | "sent" | "error";
}

interface ChatInterfaceProps {
  onJobCreated?: (jobId: string | null) => void;
}

type ProfileSource = "linkedin" | "file" | "text" | "";

const SESSION_STORAGE_KEY = "careercraft_chat_session";

interface PersistedSession {
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: string;
    status?: "sending" | "sent" | "error";
  }>;
  linkedinUrl: string;
  profileText: string;
  profileSource: ProfileSource;
  lastJobInput: string;
  lastJobId: string;
  lastJobTitle: string;
  lastCompany: string;
}

function loadPersistedSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const data: PersistedSession = JSON.parse(raw);
    if (!data.messages || !Array.isArray(data.messages) || data.messages.length === 0) {
      return null;
    }
    return data;
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

const DEFAULT_GREETING = "Hello! I'm Aria, your career success partner. I'll help you create a tailored resume.\n\nTo get started, please share your professional background. You can:\n\n1. Paste your LinkedIn profile URL\n2. Upload your current resume (PDF, DOCX, or TXT)\n3. Type a summary of your experience";

export function ChatInterface({ onJobCreated }: ChatInterfaceProps) {
  const [persisted] = useState<PersistedSession | null>(() => loadPersistedSession());

  const [messages, setMessages] = useState<Message[]>(() => {
    if (persisted) {
      return persisted.messages.map(m => ({
        ...m,
        timestamp: new Date(m.timestamp),
      }));
    }
    return [{ id: "1", role: "assistant" as const, content: DEFAULT_GREETING, timestamp: new Date() }];
  });
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [linkedinUrl, setLinkedinUrl] = useState<string>(() => persisted?.linkedinUrl ?? "");
  const [profileText, setProfileText] = useState<string>(() => persisted?.profileText ?? "");
  const [profileSource, setProfileSource] = useState<ProfileSource>(() => persisted?.profileSource ?? "");
  const [lastJobInput, setLastJobInput] = useState<string>(() => persisted?.lastJobInput ?? "");
  const [lastJobId, setLastJobId] = useState<string>(() => persisted?.lastJobId ?? "");
  const [lastJobTitle, setLastJobTitle] = useState<string>(() => persisted?.lastJobTitle ?? "");
  const [lastCompany, setLastCompany] = useState<string>(() => persisted?.lastCompany ?? "");
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollingInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
      }
    };
  }, []);

  // Restore preview panel on mount if there's a persisted job
  useEffect(() => {
    if (persisted?.lastJobId && onJobCreated) {
      onJobCreated(persisted.lastJobId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist session to localStorage (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const sessionData: PersistedSession = {
        messages: messages.map(m => ({
          ...m,
          timestamp: m.timestamp.toISOString(),
        })),
        linkedinUrl,
        profileText,
        profileSource,
        lastJobInput,
        lastJobId,
        lastJobTitle,
        lastCompany,
      };
      try {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
      } catch (e) {
        console.warn("Failed to persist session:", e);
      }
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [messages, linkedinUrl, profileText, profileSource, lastJobInput, lastJobId, lastJobTitle, lastCompany]);

  /** Start a generation job, saving the job input for potential re-generation */
  const startGeneration = async (
    jobInput: string,
    statusMessage: string,
    editInstructions?: string,
    editTarget?: "resume" | "cover_letter" | "both",
    previousJobId?: string,
    profileOverride?: { linkedinUrl?: string; profileText?: string; profileSource: ProfileSource },
  ) => {
    setLastJobInput(jobInput);
    setIsProcessing(true);

    const effectiveSource = profileOverride?.profileSource ?? profileSource;
    const effectiveLinkedinUrl = profileOverride?.linkedinUrl ?? linkedinUrl;
    const effectiveProfileText = profileOverride?.profileText ?? profileText;

    const request: {
      job_input: string;
      linkedin_url?: string;
      profile_text?: string;
      edit_instructions?: string;
      edit_target?: "resume" | "cover_letter" | "both";
      previous_job_id?: string;
    } = {
      job_input: jobInput,
    };
    if (effectiveSource === "linkedin") {
      request.linkedin_url = effectiveLinkedinUrl;
    } else {
      request.profile_text = effectiveProfileText;
    }
    if (editInstructions) {
      request.edit_instructions = editInstructions;
      request.edit_target = editTarget || "both";
    }
    if (previousJobId) {
      request.previous_job_id = previousJobId;
    }

    const response = await api.generateResume(request);

    setMessages(prev => [...prev, {
      id: `status-${response.job_id}`,
      role: "assistant",
      content: `${statusMessage}\n\nProgress: 0%`,
      timestamp: new Date(),
    }]);

    pollingInterval.current = setInterval(() => {
      pollJobStatus(response.job_id);
    }, 2000);
  };

  const pollJobStatus = async (jobId: string) => {
    try {
      const status = await api.getJobStatus(jobId);

      // Update progress message
      if (status.current_step) {
        setMessages(prev => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage.role === "assistant" && lastMessage.id === `status-${jobId}`) {
            lastMessage.content = `${status.current_step}\n\nProgress: ${status.progress}%`;
          }
          return newMessages;
        });
      }

      if (status.status === "completed") {
        if (pollingInterval.current) {
          clearInterval(pollingInterval.current);
          pollingInterval.current = null;
        }
        setIsProcessing(false);
        setIsTyping(false);

        // Track job ID, title, and company for context in follow-up chat/edits
        setLastJobId(jobId);
        if (status.job_title) setLastJobTitle(status.job_title);
        if (status.company_name) setLastCompany(status.company_name);

        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: "assistant",
          content: `Your tailored resume and cover letter have been generated successfully!\n\n${status.result || 'Documents are ready for download.'}\n\nYou can view and download them from the preview panel or the My Documents page.\n\nWhat would you like to do next? You can paste a new job posting, update your profile, request edits, or ask me anything!`,
          timestamp: new Date(),
        }]);

        if (onJobCreated) {
          onJobCreated(jobId);
        }
      } else if (status.status === "failed") {
        if (pollingInterval.current) {
          clearInterval(pollingInterval.current);
          pollingInterval.current = null;
        }
        setIsProcessing(false);
        setIsTyping(false);

        const errorMsg = status.error || 'Unknown error occurred.';
        const hasProfile = profileSource === "linkedin" ? !!linkedinUrl : !!profileText;

        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: "assistant",
          content: `Sorry, there was an error generating your resume:\n\n${errorMsg}\n\n${hasProfile ? 'Your profile is still saved — you can try again with a different job posting or request.' : 'Please try again or contact support if the issue persists.'}`,
          timestamp: new Date(),
        }]);
      }
    } catch (error) {
      console.error('Error polling job status:', error);
    }
  };

  /** Central function: send any user interaction through the LLM */
  const sendToLLM = async (userMessage: string, fileText?: string) => {
    setIsTyping(true);

    try {
      // Build conversation history (last 15 messages for context)
      const recentHistory = messages.slice(-15).map(m => ({
        role: m.role,
        content: m.content,
      }));

      // If there's file content, enrich the message with a preview
      let enrichedMessage = userMessage;
      if (fileText) {
        enrichedMessage = `[User uploaded a file with this content (${fileText.length} chars): "${fileText.slice(0, 500)}..."]\n\nUser's message: ${userMessage}`;
      }

      const hasProfile = profileSource === "linkedin" ? !!linkedinUrl : !!profileText;
      const hasGenerated = !!lastJobId;

      const chatResult = await api.chat({
        message: enrichedMessage,
        history: recentHistory,
        context: {
          profile_summary: profileSource === "linkedin"
            ? `LinkedIn profile: ${linkedinUrl}`
            : profileText
              ? `Uploaded/typed profile (${profileText.length} chars)`
              : "Not provided",
          has_profile: hasProfile,
          has_generated: hasGenerated,
          job_title: lastJobTitle || undefined,
          company: lastCompany || undefined,
        },
      });

      setIsTyping(false);

      // Always show Aria's response first
      if (chatResult.response) {
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: chatResult.response,
          timestamp: new Date(),
        }]);
      }

      // Handle profile updates from LLM response
      let profileOverride: { linkedinUrl?: string; profileText?: string; profileSource: ProfileSource } | undefined;

      if (chatResult.new_linkedin_url) {
        const url = chatResult.new_linkedin_url;
        setLinkedinUrl(url);
        setProfileSource("linkedin");
        setProfileText("");
        profileOverride = { linkedinUrl: url, profileSource: "linkedin" };
      } else if (chatResult.update_profile) {
        const text = fileText || userMessage;
        setProfileText(text);
        setProfileSource(fileText ? "file" : "text");
        setLinkedinUrl("");
        profileOverride = { profileText: text, profileSource: fileText ? "file" : "text" };
      }

      // Handle actions
      if (chatResult.action === "generate" && chatResult.job_input) {
        await startGeneration(
          chatResult.job_input,
          "Starting resume generation...",
          undefined,
          undefined,
          undefined,
          profileOverride,
        );
      } else if (chatResult.action === "edit" && chatResult.edit_instructions && lastJobInput) {
        await startGeneration(
          lastJobInput,
          "Applying your changes...",
          chatResult.edit_instructions,
          chatResult.edit_target || "both",
          lastJobId || undefined,
          profileOverride,
        );
      }

    } catch {
      setIsTyping(false);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "I'm having trouble processing that right now. Please try again, or hit 'New Chat' to start fresh.",
        timestamp: new Date(),
      }]);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isProcessing) return;

    const msg = inputValue;
    setInputValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: "user",
      content: msg,
      timestamp: new Date(),
      status: "sent",
    }]);

    await sendToLLM(msg);
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset the input so the same file can be re-selected
    e.target.value = '';

    // Validate extension client-side
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['pdf', 'docx', 'txt'].includes(ext)) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: "assistant",
        content: "Unsupported file type. Please upload a PDF, DOCX, or TXT file.",
        timestamp: new Date(),
      }]);
      return;
    }

    // Show uploading message
    setMessages(prev => [...prev, {
      id: (Date.now() - 1).toString(),
      role: "user",
      content: `[Uploaded file: ${file.name}]`,
      timestamp: new Date(),
      status: "sent",
    }]);

    try {
      const result = await api.uploadFile(file);
      await sendToLLM(`I've uploaded my file: ${file.name}`, result.text);
    } catch (error) {
      setIsTyping(false);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: "assistant",
        content: `Failed to process file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      }]);
    }
  };

  const handleNewChat = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
    setMessages([{
      id: Date.now().toString(),
      role: "assistant",
      content: DEFAULT_GREETING,
      timestamp: new Date(),
    }]);
    setInputValue("");
    setIsTyping(false);
    setIsProcessing(false);
    setLinkedinUrl("");
    setProfileText("");
    setProfileSource("");
    setLastJobInput("");
    setLastJobId("");
    setLastJobTitle("");
    setLastCompany("");
    if (onJobCreated) onJobCreated(null);
  };

  const getPlaceholder = () => {
    if (isProcessing) return "Processing...";
    return "Type a message, paste a URL, or upload a file...";
  };

  return (
    <div className="flex flex-col h-full bg-card rounded-2xl border shadow-sm overflow-hidden relative">
      {/* Chat Header */}
      <div className="p-4 border-b flex items-center justify-between bg-card/50 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 ring-2 ring-primary/20">
            <AvatarImage src="/aria-avatar.png" />
            <AvatarFallback>AC</AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-semibold text-sm">Aria Craftwell</h3>
            <p className="text-xs text-muted-foreground">AI Career Consultant</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs font-medium border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
          title="New Chat"
          disabled={isProcessing}
          onClick={handleNewChat}
        >
          <SquarePen className="h-3.5 w-3.5" />
          New Chat
        </Button>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-6 max-w-3xl mx-auto pb-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex gap-3",
                msg.role === "user" ? "flex-row-reverse" : "flex-row"
              )}
            >
              <Avatar className="h-8 w-8 mt-1 flex-shrink-0">
                {msg.role === "assistant" ? (
                  <>
                    <AvatarImage src="/aria-avatar.png" />
                    <AvatarFallback><Bot className="h-4 w-4" /></AvatarFallback>
                  </>
                ) : (
                  <>
                    <AvatarFallback><User className="h-4 w-4" /></AvatarFallback>
                  </>
                )}
              </Avatar>

              <div
                className={cn(
                  "rounded-2xl px-4 py-3 max-w-[80%] text-sm shadow-sm whitespace-pre-wrap break-words",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-secondary text-secondary-foreground rounded-tl-sm"
                )}
              >
                {msg.content}
                <div className={cn(
                  "text-[10px] mt-1 opacity-70 text-right",
                  msg.role === "user" ? "text-primary-foreground" : "text-muted-foreground"
                )}>
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}

          {isTyping && !isProcessing && (
            <div className="flex gap-3">
              <Avatar className="h-8 w-8 mt-1">
                <AvatarImage src="/aria-avatar.png" />
                <AvatarFallback>AC</AvatarFallback>
              </Avatar>
              <div className="bg-secondary rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelected}
        accept=".pdf,.docx,.txt"
        className="hidden"
      />

      {/* Input Area */}
      <div className="p-4 bg-background border-t">
        <div className="max-w-3xl mx-auto relative">
          {isProcessing && (
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 px-3 py-2 rounded-lg">
              <AlertCircle className="h-3 w-3 animate-pulse" />
              <span>Processing your request... This may take a few minutes.</span>
            </div>
          )}

          <div className="relative flex items-center gap-2 bg-secondary/50 p-2 rounded-xl border focus-within:ring-1 focus-within:ring-primary/50 transition-all">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-foreground rounded-lg shrink-0"
              disabled={isProcessing}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" />
            </Button>

            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => { setInputValue(e.target.value); autoResizeTextarea(); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={getPlaceholder()}
              className="flex-1 resize-none border-0 bg-transparent focus:outline-none focus:ring-0 px-2 py-3 text-sm min-h-[44px] max-h-[160px] shadow-none"
              disabled={isProcessing}
              rows={1}
            />

            <Button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isProcessing}
              size="icon"
              className={cn(
                "h-9 w-9 rounded-lg shrink-0 transition-all",
                inputValue.trim() && !isProcessing
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90"
                  : "bg-muted text-muted-foreground hover:bg-muted"
              )}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex justify-center mt-2 gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <LinkIcon className="h-3 w-3" /> LinkedIn URL
            </span>
            <span className="flex items-center gap-1">
              <Upload className="h-3 w-3" /> PDF, DOCX, TXT
            </span>
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" /> PDF Export
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
