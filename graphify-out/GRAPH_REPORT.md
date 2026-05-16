# Graph Report - .  (2026-05-16)

## Corpus Check
- 189 files · ~59,512 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 750 nodes · 1506 edges · 62 communities (51 shown, 11 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Core Backend & Scrapers|Core Backend & Scrapers]]
- [[_COMMUNITY_UI Form Primitives|UI Form Primitives]]
- [[_COMMUNITY_Layout & Navigation|Layout & Navigation]]
- [[_COMMUNITY_API Communication|API Communication]]
- [[_COMMUNITY_Database Infrastructure|Database Infrastructure]]
- [[_COMMUNITY_AI Search Services|AI Search Services]]
- [[_COMMUNITY_Frontend Application Logic|Frontend Application Logic]]
- [[_COMMUNITY_Common UI Components|Common UI Components]]
- [[_COMMUNITY_Notification System|Notification System]]
- [[_COMMUNITY_Navigation & Inputs|Navigation & Inputs]]
- [[_COMMUNITY_Dialogs & Commands|Dialogs & Commands]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_AI Discovery Engine|AI Discovery Engine]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Project Architecture|Project Architecture]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]

## God Nodes (most connected - your core abstractions)
1. `cn()` - 104 edges
2. `logger` - 21 edges
3. `newStealthContext()` - 14 edges
4. `humanDelay()` - 14 edges
5. `humanScroll()` - 14 edges
6. `getBrowser()` - 13 edges
7. `ScrapedJob` - 13 edges
8. `JobEmitter` - 12 edges
9. `LogEmitter` - 12 edges
10. `customFetch()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Hybrid Job Discovery` --uses--> `AI Discovery Pipeline`  [INFERRED]
  README.md → artifacts/api-server/src/services/job-search.service.ts
- `AI Discovery Pipeline` --uses--> `Ollama Integration`  [INFERRED]
  artifacts/api-server/src/services/job-search.service.ts → README.md
- `JobPilot` --persists_via--> `Drizzle ORM`  [EXTRACTED]
  README.md → lib/db/src/index.ts
- `JobPilot` --defines_api_via--> `API Specification`  [EXTRACTED]
  README.md → lib/api-spec/openapi.yaml
- `runJobSearch()` --calls--> `runAIDiscovery()`  [EXTRACTED]
  artifacts/api-server/src/services/job-search.service.ts → artifacts/api-server/src/services/ai-discovery.service.ts

## Communities (62 total, 11 thin omitted)

### Community 0 - "Core Backend & Scrapers"
Cohesion: 0.08
Nodes (56): logger, router, ArbeitnowJob, dateFilterToDays(), scrapeArbeitnow(), getBrowser(), humanDelay(), humanScroll() (+48 more)

### Community 1 - "UI Form Primitives"
Cohesion: 0.08
Nodes (41): ButtonGroup(), ButtonGroupSeparator(), ButtonGroupText(), buttonGroupVariants, Field(), FieldContent(), FieldDescription(), FieldError() (+33 more)

### Community 2 - "Layout & Navigation"
Cohesion: 0.09
Nodes (38): useIsMobile(), SheetContent, SheetContentProps, SheetDescription, SheetFooter(), SheetHeader(), SheetOverlay, SheetTitle (+30 more)

### Community 3 - "API Communication"
Cohesion: 0.07
Nodes (38): Awaited, AwaitedInput, getHealthCheckQueryKey(), getHealthCheckQueryOptions(), getHealthCheckUrl(), healthCheck(), HealthCheckQueryError, HealthCheckQueryResult (+30 more)

### Community 4 - "Database Infrastructure"
Cohesion: 0.05
Nodes (38): dbInstance, sqlite, aiAnalysesTable, AIAnalysis, DedupeAnalysisResult, dedupeAnalysisResultSchema, FieldMappingResult, fieldMappingResultSchema (+30 more)

### Community 5 - "AI Search Services"
Cohesion: 0.06
Nodes (25): aiService, { jobs, backend }, profileData, results, router, scoreJobsSchema, data, router (+17 more)

### Community 6 - "Frontend Application Logic"
Cohesion: 0.08
Nodes (24): addPortal(), AIBackend, clearAllJobs(), CustomPortal, dedupeJobsWithAI(), deleteJob(), deletePortal(), fetchPortals() (+16 more)

### Community 7 - "Common UI Components"
Cohesion: 0.12
Nodes (13): cn(), Badge(), BadgeProps, badgeVariants, Checkbox, HoverCardContent, Kbd(), KbdGroup() (+5 more)

### Community 8 - "Notification System"
Cohesion: 0.17
Nodes (24): Action, ActionType, actionTypes, addToRemoveQueue(), dispatch(), genId(), listeners, memoryState (+16 more)

### Community 9 - "Navigation & Inputs"
Cohesion: 0.22
Nodes (13): Button, ButtonProps, buttonVariants, Calendar(), CalendarDayButton(), Pagination(), PaginationContent, PaginationEllipsis() (+5 more)

### Community 10 - "Dialogs & Commands"
Cohesion: 0.2
Nodes (15): Command, CommandDialog(), CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator (+7 more)

### Community 11 - "Community 11"
Cohesion: 0.21
Nodes (16): Menubar, MenubarCheckboxItem, MenubarContent, MenubarGroup(), MenubarItem, MenubarLabel, MenubarMenu(), MenubarPortal() (+8 more)

### Community 12 - "Community 12"
Cohesion: 0.25
Nodes (10): InputGroup(), InputGroupAddon(), inputGroupAddonVariants, InputGroupButton(), inputGroupButtonVariants, InputGroupInput(), InputGroupText(), InputGroupTextarea() (+2 more)

### Community 13 - "AI Discovery Engine"
Cohesion: 0.22
Nodes (14): AIDiscoveryOptions, AIDiscoveryProgress, cleanText(), extractCompanyFromUrl(), extractJobFromSearchResult(), generateSearchQueries(), isDirectJobListing(), parseDDGHtml() (+6 more)

### Community 14 - "Community 14"
Cohesion: 0.25
Nodes (13): Carousel, CarouselApi, CarouselContent, CarouselContext, CarouselContextProps, CarouselItem, CarouselNext, CarouselOptions (+5 more)

### Community 15 - "Community 15"
Cohesion: 0.3
Nodes (10): ChartConfig, ChartContainer, ChartContext, ChartContextProps, ChartLegendContent, ChartStyle(), ChartTooltipContent, getPayloadConfigFromPayload() (+2 more)

### Community 16 - "Community 16"
Cohesion: 0.33
Nodes (9): ContextMenuCheckboxItem, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuRadioItem, ContextMenuSeparator, ContextMenuShortcut(), ContextMenuSubContent (+1 more)

### Community 17 - "Community 17"
Cohesion: 0.33
Nodes (9): DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut(), DropdownMenuSubContent (+1 more)

### Community 18 - "Community 18"
Cohesion: 0.36
Nodes (8): AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter(), AlertDialogHeader(), AlertDialogOverlay, AlertDialogTitle

### Community 19 - "Community 19"
Cohesion: 0.36
Nodes (6): Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle

### Community 20 - "Community 20"
Cohesion: 0.36
Nodes (8): Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow

### Community 21 - "Community 21"
Cohesion: 0.39
Nodes (7): Breadcrumb, BreadcrumbEllipsis(), BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator()

### Community 22 - "Community 22"
Cohesion: 0.39
Nodes (7): Drawer(), DrawerContent, DrawerDescription, DrawerFooter(), DrawerHeader(), DrawerOverlay, DrawerTitle

### Community 23 - "Community 23"
Cohesion: 0.42
Nodes (7): Empty(), EmptyContent(), EmptyDescription(), EmptyHeader(), EmptyMedia(), emptyMediaVariants, EmptyTitle()

### Community 24 - "Community 24"
Cohesion: 0.39
Nodes (7): NavigationMenu, NavigationMenuContent, NavigationMenuIndicator, NavigationMenuList, NavigationMenuTrigger, navigationMenuTriggerStyle, NavigationMenuViewport

### Community 25 - "Community 25"
Cohesion: 0.39
Nodes (7): SelectContent, SelectItem, SelectLabel, SelectScrollDownButton, SelectScrollUpButton, SelectSeparator, SelectTrigger

### Community 26 - "Community 26"
Cohesion: 0.39
Nodes (5): ToggleGroup, ToggleGroupContext, ToggleGroupItem, Toggle, toggleVariants

### Community 27 - "Project Architecture"
Cohesion: 0.22
Nodes (9): API Specification, Drizzle ORM, Hybrid Job Discovery, JobPilot, Ollama Integration, AI Discovery Pipeline, Indeed Scraper, Playwright Stealth (+1 more)

### Community 28 - "Community 28"
Cohesion: 0.25
Nodes (3): JOBS, STATS, STATUS_COLORS

### Community 29 - "Community 29"
Cohesion: 0.29
Nodes (6): dbPath, __dirname, __filename, profileRows, rows, sqlite

### Community 30 - "Community 30"
Cohesion: 0.53
Nodes (4): InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot

### Community 31 - "Community 31"
Cohesion: 0.53
Nodes (4): Alert, AlertDescription, AlertTitle, alertVariants

### Community 32 - "Community 32"
Cohesion: 0.6
Nodes (3): Avatar, AvatarFallback, AvatarImage

### Community 33 - "Community 33"
Cohesion: 0.6
Nodes (3): TabsContent, TabsList, TabsTrigger

### Community 34 - "Community 34"
Cohesion: 0.6
Nodes (3): AccordionContent, AccordionItem, AccordionTrigger

### Community 35 - "Community 35"
Cohesion: 0.4
Nodes (3): apiClientReactSrc, apiZodSrc, root

### Community 36 - "Community 36"
Cohesion: 0.5
Nodes (3): DiscoveredComponent, mockupPreviewPlugin(), port

### Community 40 - "Community 40"
Cohesion: 0.5
Nodes (3): profileRows, rows, sqlite

## Knowledge Gaps
- **123 isolated node(s):** `sqlite`, `stmt`, `sqlite`, `rows`, `profileRows` (+118 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `Common UI Components` to `UI Form Primitives`, `Layout & Navigation`, `Notification System`, `Navigation & Inputs`, `Dialogs & Commands`, `Community 11`, `Community 12`, `Community 14`, `Community 15`, `Community 16`, `Community 17`, `Community 18`, `Community 19`, `Community 20`, `Community 21`, `Community 22`, `Community 23`, `Community 24`, `Community 25`, `Community 26`, `Community 30`, `Community 31`, `Community 32`, `Community 33`, `Community 34`, `Community 37`, `Community 38`, `Community 39`?**
  _High betweenness centrality (0.183) - this node is a cross-community bridge._
- **Why does `App()` connect `Frontend Application Logic` to `Core Backend & Scrapers`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `logger` connect `Core Backend & Scrapers` to `AI Discovery Engine`, `AI Search Services`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **What connects `sqlite`, `stmt`, `sqlite` to the rest of the system?**
  _123 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core Backend & Scrapers` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `UI Form Primitives` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Layout & Navigation` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._