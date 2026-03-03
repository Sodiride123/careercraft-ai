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

type ConversationState = "initial" | "awaiting_linkedin" | "awaiting_job" | "processing" | "completed";
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
  const [lastJobInput, setLastJobInput] = useState<string>("");
  const [lastJobId, setLastJobId] = useState<string>("");
  const [pendingFileText, setPendingFileText] = useState<string>("");
  const [lastJobTitle, setLastJobTitle] = useState<string>("");
  const [lastCompany, setLastCompany] = useState<string>("");
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

  const isLinkedInJobUrl = (text: string): boolean => {
    return /linkedin\.com\/jobs\//i.test(text);
  };

  const isUrl = (text: string): boolean => {
    const trimmed = text.trim();
    return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('www.');
  };

  /** Start a generation job, saving the job input for potential re-generation */
  const startGeneration = async (
    jobInput: string,
    statusMessage: string,
    editInstructions?: string,
    editTarget?: "resume" | "cover_letter" | "both",
    previousJobId?: string,
  ) => {
    setLastJobInput(jobInput);
    setIsProcessing(true);
    setConversationState("processing");

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
    if (profileSource === "linkedin") {
      request.linkedin_url = linkedinUrl;
    } else {
      request.profile_text = profileText;
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
      } else if (conversationState === "completed") {
        // In completed state — don't auto-generate. Store the file text
        // and ask the user what they want to do with it.
        setPendingFileText(result.text);
        setIsTyping(false);
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: "assistant",
          content: `I've processed "${file.name}" (${result.characters.toLocaleString()} characters).\n\nWhat would you like me to do with this?\n\n1. Use it as a new job description to generate a new resume\n2. Use it to update your profile\n3. Something else — just tell me!`,
          timestamp: new Date(),
        }]);
      } else if (conversationState === "awaiting_job") {
        // File is a job description
        setIsTyping(false);

        // Use the file text as job input and start generation
        setIsTyping(false);
        await startGeneration(result.text, "Starting resume generation...");
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
        setConversationState("completed");

        // Track job ID, title, and company for context in follow-up chat/edits
        setLastJobId(jobId);
        if (status.job_title) setLastJobTitle(status.job_title);
        if (status.company_name) setLastCompany(status.company_name);

        const hasProfile = profileSource === "linkedin" ? !!linkedinUrl : !!profileText;
        const followUpHint = hasProfile
          ? `What would you like to do next?\n\n1. Paste a new job posting — I'll reuse your profile and generate a new resume\n2. Share a new LinkedIn URL or upload a new resume to update your profile\n3. Hit the "New Chat" button in the top-right to start completely fresh`
          : `Would you like to create another resume? Share your profile to start again!`;

        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: "assistant",
          content: `Your tailored resume and cover letter have been generated successfully!\n\n${status.result || 'Documents are ready for download.'}\n\nYou can view and download them from the preview panel or the My Documents page.\n\n${followUpHint}`,
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
          // Return to completed (not initial) if we have a profile, so user can retry
          const hasProfile = profileSource === "linkedin" ? !!linkedinUrl : !!profileText;
          setConversationState(hasProfile ? "completed" : "initial");
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: "assistant",
            content: `Sorry, there was an error generating your resume:\n\n${errorMsg}\n\n${hasProfile ? 'Your profile is still saved — you can try again with a different job posting or request.' : 'Please try again or contact support if the issue persists.'}`,
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

        if (isLinkedInJobUrl(messageText)) {
          // LinkedIn JOB URL pasted when we need a profile — guide the user
          setTimeout(() => {
            setIsTyping(false);
            setMessages(prev => [...prev, {
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content: "That looks like a LinkedIn job posting, not a profile URL. I need your professional background first.\n\nPlease share:\n\n1. Your LinkedIn profile URL (e.g., linkedin.com/in/your-name)\n2. Upload your resume (use the paperclip button)\n3. Type a summary of your experience",
              timestamp: new Date(),
            }]);
          }, 1000);
        } else if (extractedUrl) {
          // LinkedIn PROFILE URL
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
        setIsTyping(false);
        await startGeneration(jobInput, "Starting resume generation...");

      } else if (conversationState === "completed") {
        // Post-generation: ALL input goes through LLM so it can ask
        // "what do you want to do?" instead of auto-triggering generation.
        const hasProfile = profileSource === "linkedin" ? !!linkedinUrl : !!profileText;

        // Only fallback: no profile saved at all → restart from scratch
        if (!hasProfile) {
          setTimeout(() => {
            setIsTyping(false);
            setMessages(prev => [...prev, {
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content: "Let's get started! Please share your professional background:\n\n1. Paste your LinkedIn profile URL\n2. Upload your resume (use the paperclip button)\n3. Type a summary of your experience",
              timestamp: new Date(),
            }]);
            setConversationState("awaiting_linkedin");
          }, 500);

        // Everything else → LLM decides what to do
        } else {
          try {
            // Build conversation history (last 15 messages for context).
            // Note: messages state hasn't updated with the current user
            // message yet (React batching), so this is prior context only.
            // The current message is sent separately as the `message` field.
            const recentHistory = messages.slice(-15).map(m => ({
              role: m.role,
              content: m.content,
            }));

            // If user just uploaded a file, prepend that info to the message
            let enrichedMessage = messageText;
            if (pendingFileText) {
              enrichedMessage = `[User recently uploaded a file with this content (${pendingFileText.length} chars): "${pendingFileText.slice(0, 500)}..."]\n\nUser's message: ${messageText}`;
              setPendingFileText("");
            }

            const chatResult = await api.chat({
              message: enrichedMessage,
              history: recentHistory,
              context: {
                profile_summary: profileSource === "linkedin"
                  ? `LinkedIn profile: ${linkedinUrl}`
                  : `Uploaded/typed profile (${profileText.length} chars)`,
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

            // Then act on the LLM's decision
            if (chatResult.action === "generate" && chatResult.job_input) {
              await startGeneration(chatResult.job_input, "Reusing your profile to generate a new resume and cover letter!");
            } else if (chatResult.action === "edit" && chatResult.edit_instructions && lastJobInput) {
              await startGeneration(lastJobInput, "Applying your changes...", chatResult.edit_instructions, chatResult.edit_target || "both", lastJobId || undefined);
            }
            // action === null → just the response, no generation

          } catch {
            setIsTyping(false);
            setMessages(prev => [...prev, {
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content: "I'm having trouble processing that. You can paste a new job posting to generate another resume, or hit 'New Chat' to start fresh.",
              timestamp: new Date(),
            }]);
          }
        }

      } else {
        // "initial" state — fresh start
        const extractedUrl = extractLinkedInUrl(messageText);

        if (extractedUrl) {
          setLinkedinUrl(extractedUrl);
          setProfileSource("linkedin");
          setProfileText("");
          setConversationState("awaiting_job");

          setTimeout(() => {
            setIsTyping(false);
            setMessages(prev => [...prev, {
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content: `Perfect! I've got your LinkedIn profile: ${extractedUrl}\n\nNow, please provide the job details:\n\n1. Paste a LinkedIn job URL (recommended)\n2. Paste the job description text\n3. Type a job title (e.g., "Software Manager at OpenAI")`,
              timestamp: new Date(),
            }]);
          }, 1000);
        } else {
          setTimeout(() => {
            setIsTyping(false);
            setMessages(prev => [...prev, {
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content: "To get started, please share your professional background:\n\n1. Paste your LinkedIn profile URL\n2. Upload your resume (use the paperclip button)\n3. Type a summary of your experience",
              timestamp: new Date(),
            }]);
            setConversationState("awaiting_linkedin");
          }, 1000);
        }
      }

    } catch (error) {
      setIsTyping(false);
      setIsProcessing(false);
      // If we had a profile, return to completed so the user can retry
      const hasProfile = profileSource === "linkedin" ? !!linkedinUrl : !!profileText;
      setConversationState(hasProfile ? "completed" : "initial");
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Error: ${error instanceof Error ? error.message : 'Failed to start resume generation. Please try again.'}${hasProfile ? '\n\nYour profile is still saved — you can try again with a different job posting.' : ''}`,
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
    setLastJobInput("");
    setLastJobId("");
    setLastJobTitle("");
    setLastCompany("");
    setPendingFileText("");
  };

  const getPlaceholder = () => {
    if (isProcessing) return "Processing...";
    if (conversationState === "awaiting_linkedin") return "Paste LinkedIn URL, upload resume, or describe yourself...";
    if (conversationState === "awaiting_job") return "Paste LinkedIn job URL or describe the role...";
    if (conversationState === "completed") return "Ask a question, request edits, or paste a new job...";
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
