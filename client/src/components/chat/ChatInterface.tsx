import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { ArrowUp, Bot, FileText, Link as LinkIcon, Paperclip, SquarePen, User, AlertCircle, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  status?: "sending" | "sent" | "error";
}

interface ChatInterfaceProps {
  onJobCreated?: (jobId: string) => void;
}

type ConversationState = "initial" | "awaiting_linkedin" | "awaiting_job" | "processing";
type ProfileSource = "linkedin" | "file" | "text" | "";

export function ChatInterface({ onJobCreated }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "Hello! I'm Aria, your career success partner. I'll help you create a tailored resume.\n\nTo get started, please share your professional background. You can:\n\n1. Paste your LinkedIn profile URL\n2. Upload your current resume (PDF, DOCX, or TXT)\n3. Type a summary of your experience",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversationState, setConversationState] = useState<ConversationState>("awaiting_linkedin");
  const [linkedinUrl, setLinkedinUrl] = useState<string>("");
  const [profileText, setProfileText] = useState<string>("");
  const [profileSource, setProfileSource] = useState<ProfileSource>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollingInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const extractLinkedInUrl = (text: string): string | null => {
    const cleanText = text.trim();

    // Pattern 1: Full URL with protocol
    let linkedinMatch = cleanText.match(/https?:\/\/(www\.)?linkedin\.com\/[^\s]+/i);
    if (linkedinMatch) return linkedinMatch[0];

    // Pattern 2: URL without protocol
    linkedinMatch = cleanText.match(/(www\.)?linkedin\.com\/[^\s]+/i);
    if (linkedinMatch) return `https://${linkedinMatch[0]}`;

    // Pattern 3: Just the path (in/username)
    linkedinMatch = cleanText.match(/^in\/[a-zA-Z0-9-]+\/?$/i);
    if (linkedinMatch) return `https://www.linkedin.com/${linkedinMatch[0]}`;

    // Pattern 4: Username with hyphens
    if (/^[a-zA-Z0-9-]{3,100}$/.test(cleanText) && cleanText.includes('-')) {
      return `https://www.linkedin.com/in/${cleanText}`;
    }

    return null;
  };

  const isUrl = (text: string): boolean => {
    const trimmed = text.trim();
    return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('www.');
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
    setIsTyping(true);

    try {
      const result = await api.uploadFile(file);

      if (conversationState === "awaiting_linkedin") {
        // File is a profile/resume
        setProfileText(result.text);
        setProfileSource("file");
        setConversationState("awaiting_job");

        setIsTyping(false);
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: "assistant",
          content: `Got it! I've extracted your profile from "${file.name}" (${result.characters.toLocaleString()} characters).\n\nNow, please provide the job you're targeting. You can:\n\n1. Paste a LinkedIn job URL (recommended)\n2. Paste the job description text\n3. Type a job title (e.g., "Software Engineer at Google")`,
          timestamp: new Date(),
        }]);
      } else if (conversationState === "awaiting_job") {
        // File is a job description
        setIsTyping(false);

        // Use the file text as job input and start generation
        setIsProcessing(true);
        setConversationState("processing");

        const request: { job_input: string; linkedin_url?: string; profile_text?: string } = {
          job_input: result.text,
        };
        if (profileSource === "linkedin") {
          request.linkedin_url = linkedinUrl;
        } else {
          request.profile_text = profileText;
        }

        const response = await api.generateResume(request);

        setMessages(prev => [...prev, {
          id: `status-${response.job_id}`,
          role: "assistant",
          content: "Starting resume generation...\n\nProgress: 0%",
          timestamp: new Date(),
        }]);

        pollingInterval.current = setInterval(() => {
          pollJobStatus(response.job_id);
        }, 2000);
      }
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
        setConversationState("initial");

        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: "assistant",
          content: `Your tailored resume has been generated successfully!\n\n${status.result || 'Resume is ready for download.'}\n\nYou can download your resume and cover letter using the buttons in the preview panel.\n\nWould you like to create another resume? Share your profile to start again!`,
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

        // Check if the error is about job URL access — return to awaiting_job so user can retry
        const errorMsg = status.error || 'Unknown error occurred.';
        const isJobAccessError = errorMsg.toLowerCase().includes('could not access')
          || errorMsg.toLowerCase().includes('website may require')
          || errorMsg.toLowerCase().includes('try one of these alternatives');

        if (isJobAccessError) {
          setConversationState("awaiting_job");
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: "assistant",
            content: `${errorMsg}\n\nPlease try again with a different job input.`,
            timestamp: new Date(),
          }]);
        } else {
          setConversationState("initial");
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: "assistant",
            content: `Sorry, there was an error generating your resume:\n\n${errorMsg}\n\nPlease try again or contact support if the issue persists.`,
            timestamp: new Date(),
          }]);
        }
      }
    } catch (error) {
      console.error('Error polling job status:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isProcessing) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue,
      timestamp: new Date(),
      status: "sent",
    };

    setMessages(prev => [...prev, userMessage]);
    const messageText = inputValue;
    setInputValue("");
    setIsTyping(true);

    try {
      if (conversationState === "awaiting_linkedin") {
        // Step 1: Collect profile — LinkedIn URL, or free text
        const extractedUrl = extractLinkedInUrl(messageText);

        if (extractedUrl) {
          // LinkedIn URL
          setLinkedinUrl(extractedUrl);
          setProfileSource("linkedin");
          setConversationState("awaiting_job");

          setTimeout(() => {
            setIsTyping(false);
            setMessages(prev => [...prev, {
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content: `Great! I've got your LinkedIn profile: ${extractedUrl}\n\nNow, please provide the job details. You can:\n\n1. Paste a LinkedIn job URL (recommended)\n2. Paste the job description text\n3. Type a job title (e.g., "Software Manager at OpenAI")`,
              timestamp: new Date(),
            }]);
          }, 1000);
        } else if (isUrl(messageText)) {
          // Non-LinkedIn URL — not supported as profile input
          setTimeout(() => {
            setIsTyping(false);
            setMessages(prev => [...prev, {
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content: "I can only fetch profiles from LinkedIn URLs directly.\n\nPlease provide your profile using one of these methods:\n\n1. Paste your LinkedIn profile URL\n2. Upload your resume file (use the paperclip button)\n3. Type a summary of your professional background",
              timestamp: new Date(),
            }]);
          }, 1000);
        } else if (messageText.trim().length > 20) {
          // Free text — treat as profile description
          setProfileText(messageText.trim());
          setProfileSource("text");
          setConversationState("awaiting_job");

          setTimeout(() => {
            setIsTyping(false);
            setMessages(prev => [...prev, {
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content: `Thanks! I've noted your professional background.\n\nNow, please provide the job you're targeting. You can:\n\n1. Paste a LinkedIn job URL (recommended)\n2. Paste the job description text\n3. Type a job title (e.g., "Software Engineer at Google")`,
              timestamp: new Date(),
            }]);
          }, 1000);
        } else {
          // Too short
          setTimeout(() => {
            setIsTyping(false);
            setMessages(prev => [...prev, {
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content: "That's a bit brief. Could you provide more detail about your background?\n\nYou can:\n1. Paste your LinkedIn profile URL\n2. Upload your resume (use the paperclip button)\n3. Describe your experience, skills, and education in more detail",
              timestamp: new Date(),
            }]);
          }, 1000);
        }

      } else if (conversationState === "awaiting_job") {
        // Step 2: Collect job input
        const jobInput = messageText.trim();

        if (!jobInput) {
          setTimeout(() => {
            setIsTyping(false);
            setMessages(prev => [...prev, {
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content: "Please provide job details. You can:\n\n1. Paste a LinkedIn job URL (recommended)\n2. Paste the job description text\n3. Type a job title (e.g., \"Software Manager at OpenAI\")",
              timestamp: new Date(),
            }]);
          }, 1000);
          return;
        }

        // Start processing
        setIsProcessing(true);
        setConversationState("processing");

        // Build request based on profile source
        const request: { job_input: string; linkedin_url?: string; profile_text?: string } = {
          job_input: jobInput,
        };
        if (profileSource === "linkedin") {
          request.linkedin_url = linkedinUrl;
        } else {
          request.profile_text = profileText;
        }

        const response = await api.generateResume(request);

        setMessages(prev => [...prev, {
          id: `status-${response.job_id}`,
          role: "assistant",
          content: "Starting resume generation...\n\nProgress: 0%",
          timestamp: new Date(),
        }]);

        // Start polling for status
        pollingInterval.current = setInterval(() => {
          pollJobStatus(response.job_id);
        }, 2000);

      } else {
        // Handle general conversation or restart
        const extractedUrl = extractLinkedInUrl(messageText);

        if (extractedUrl) {
          // User wants to start a new resume with LinkedIn
          setLinkedinUrl(extractedUrl);
          setProfileSource("linkedin");
          setProfileText("");
          setConversationState("awaiting_job");

          setTimeout(() => {
            setIsTyping(false);
            setMessages(prev => [...prev, {
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content: `Perfect! I've got your LinkedIn profile: ${extractedUrl}\n\nNow, please provide the job details. You can:\n\n1. Paste a LinkedIn job URL (recommended)\n2. Paste the job description text\n3. Type a job title (e.g., "Software Manager at OpenAI")`,
              timestamp: new Date(),
            }]);
          }, 1000);
        } else {
          setTimeout(() => {
            setIsTyping(false);
            setMessages(prev => [...prev, {
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content: "I'm here to help you create tailored resumes!\n\nTo get started, please share your professional background:\n\n1. Paste your LinkedIn profile URL\n2. Upload your resume (use the paperclip button)\n3. Type a summary of your experience",
              timestamp: new Date(),
            }]);
            setConversationState("awaiting_linkedin");
          }, 1000);
        }
      }

    } catch (error) {
      setIsTyping(false);
      setIsProcessing(false);
      setConversationState("initial");
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Error: ${error instanceof Error ? error.message : 'Failed to start resume generation. Please try again.'}`,
        timestamp: new Date(),
      }]);
    }
  };

  const handleNewChat = () => {
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
    setMessages([{
      id: Date.now().toString(),
      role: "assistant",
      content: "Hello! I'm Aria, your career success partner. I'll help you create a tailored resume.\n\nTo get started, please share your professional background. You can:\n\n1. Paste your LinkedIn profile URL\n2. Upload your current resume (PDF, DOCX, or TXT)\n3. Type a summary of your experience",
      timestamp: new Date(),
    }]);
    setInputValue("");
    setIsTyping(false);
    setIsProcessing(false);
    setConversationState("awaiting_linkedin");
    setLinkedinUrl("");
    setProfileText("");
    setProfileSource("");
  };

  const getPlaceholder = () => {
    if (isProcessing) return "Processing...";
    if (conversationState === "awaiting_linkedin") return "Paste LinkedIn URL, upload resume, or describe yourself...";
    if (conversationState === "awaiting_job") return "Paste LinkedIn job URL or describe the role...";
    return "Type a message or paste LinkedIn URL...";
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
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="New Chat"
          disabled={isProcessing}
          onClick={handleNewChat}
        >
          <SquarePen className="h-4 w-4" />
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
                  "rounded-2xl px-4 py-3 max-w-[80%] text-sm shadow-sm whitespace-pre-wrap",
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

            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
              placeholder={getPlaceholder()}
              className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-2 py-3 h-auto max-h-32 shadow-none"
              disabled={isProcessing}
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
