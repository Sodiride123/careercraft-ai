import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { ArrowUp, Bot, FileText, Link as LinkIcon, Paperclip, Settings, User, AlertCircle } from "lucide-react";
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

export function ChatInterface({ onJobCreated }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "Hello! I'm Aria, your career success partner. I'll help you create a tailored resume.\n\nLet's start with your LinkedIn profile. Please paste your LinkedIn profile URL.",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversationState, setConversationState] = useState<ConversationState>("awaiting_linkedin");
  const [linkedinUrl, setLinkedinUrl] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollingInterval = useRef<ReturnType<typeof setInterval> | null>(null);

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
    // Remove any whitespace
    const cleanText = text.trim();
    
    // Pattern 1: Full URL with protocol (https://linkedin.com/in/username or https://www.linkedin.com/in/username)
    let linkedinMatch = cleanText.match(/https?:\/\/(www\.)?linkedin\.com\/[^\s]+/i);
    if (linkedinMatch) {
      return linkedinMatch[0];
    }
    
    // Pattern 2: URL without protocol (linkedin.com/in/username or www.linkedin.com/in/username)
    linkedinMatch = cleanText.match(/(www\.)?linkedin\.com\/[^\s]+/i);
    if (linkedinMatch) {
      return `https://${linkedinMatch[0]}`;
    }
    
    // Pattern 3: Just the path (in/username)
    linkedinMatch = cleanText.match(/^in\/[a-zA-Z0-9-]+\/?$/i);
    if (linkedinMatch) {
      return `https://www.linkedin.com/${linkedinMatch[0]}`;
    }
    
    // Pattern 4: Just the username (username or patrick-taylor-au)
    // This is a bit more aggressive - only match if it looks like a LinkedIn username
    // (alphanumeric with hyphens, no spaces, reasonable length)
    if (/^[a-zA-Z0-9-]{3,100}$/.test(cleanText) && cleanText.includes('-')) {
      return `https://www.linkedin.com/in/${cleanText}`;
    }
    
    return null;
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

        // Add completion message
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: "assistant",
          content: `✅ Your tailored resume has been generated successfully!\n\n${status.result || 'Resume is ready for download.'}\n\nYou can download your resume and cover letter using the buttons in the preview panel.\n\nWould you like to create another resume? Just paste a new LinkedIn URL to start!`,
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
        setConversationState("initial");

        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: "assistant",
          content: `❌ Sorry, there was an error generating your resume:\n\n${status.error || 'Unknown error occurred.'}\n\nPlease try again or contact support if the issue persists.`,
          timestamp: new Date(),
        }]);
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
        // Step 1: Collect LinkedIn URL
        const extractedUrl = extractLinkedInUrl(messageText);

        if (!extractedUrl) {
          setTimeout(() => {
            setIsTyping(false);
            setMessages(prev => [...prev, {
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content: "I couldn't find a valid LinkedIn profile URL in your message.\n\nPlease provide a LinkedIn profile URL like:\nhttps://linkedin.com/in/yourprofile",
              timestamp: new Date(),
            }]);
          }, 1000);
          return;
        }

        // Save LinkedIn URL and move to next step
        setLinkedinUrl(extractedUrl);
        setConversationState("awaiting_job");

        setTimeout(() => {
          setIsTyping(false);
          setMessages(prev => [...prev, {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: `Great! I've got your LinkedIn profile: ${extractedUrl}\n\nNow, please provide the job details. You can:\n\n1. Paste a LinkedIn job URL\n2. Paste any job posting URL\n3. Paste the job description text\n4. Simply type a job title (e.g., "Software Manager at OpenAI")`,
            timestamp: new Date(),
          }]);
        }, 1000);

      } else if (conversationState === "awaiting_job") {
        // Step 2: Collect job input (URL, text, or title - backend detects type)
        const jobInput = messageText.trim();

        if (!jobInput) {
          setTimeout(() => {
            setIsTyping(false);
            setMessages(prev => [...prev, {
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content: "Please provide job details. You can:\n\n1. Paste a LinkedIn job URL\n2. Paste any job posting URL\n3. Paste the job description text\n4. Simply type a job title (e.g., \"Software Manager at OpenAI\")",
              timestamp: new Date(),
            }]);
          }, 1000);
          return;
        }

        // Start processing
        setIsProcessing(true);
        setConversationState("processing");

        // Call the API with single job_input field
        const response = await api.generateResume({
          linkedin_url: linkedinUrl,
          job_input: jobInput,
        });

        // Add initial processing message
        setMessages(prev => [...prev, {
          id: `status-${response.job_id}`,
          role: "assistant",
          content: "🚀 Starting resume generation...\n\nProgress: 0%",
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
          // User wants to start a new resume
          setLinkedinUrl(extractedUrl);
          setConversationState("awaiting_job");

          setTimeout(() => {
            setIsTyping(false);
            setMessages(prev => [...prev, {
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content: `Perfect! I've got your LinkedIn profile: ${extractedUrl}\n\nNow, please provide the job details. You can either:\n\n1. Paste a job posting URL, or\n2. Paste the job description text, or\n3. Simply describe the role (e.g., "Software Manager at OpenAI")`,
              timestamp: new Date(),
            }]);
          }, 1000);
        } else {
          setTimeout(() => {
            setIsTyping(false);
            setMessages(prev => [...prev, {
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content: "I'm here to help you create tailored resumes!\n\nTo get started, please paste your LinkedIn profile URL.",
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
        content: `❌ Error: ${error instanceof Error ? error.message : 'Failed to start resume generation. Please try again.'}`,
        timestamp: new Date(),
      }]);
    }
  };

  const getPlaceholder = () => {
    if (isProcessing) return "Processing...";
    if (conversationState === "awaiting_linkedin") return "Paste your LinkedIn profile URL...";
    if (conversationState === "awaiting_job") return "Paste job URL or describe the role...";
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
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Settings className="h-4 w-4" />
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
              <LinkIcon className="h-3 w-3" /> LinkedIn Supported
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