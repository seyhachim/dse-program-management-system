// Utilities
export { cn } from "./lib/cn.ts";

// Primitives (@base-ui/react — see components.json "style": "base-luma")
export { Button, buttonVariants } from "./components/ui/button.tsx";
export { Input } from "./components/ui/input.tsx";
export { Switch } from "./components/ui/switch.tsx";
export { Checkbox } from "./components/ui/checkbox.tsx";
export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./components/ui/dialog.tsx";
export { Label } from "./components/ui/label.tsx";
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
} from "./components/ui/select.tsx";
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
} from "./components/ui/dropdown-menu.tsx";
export { Separator } from "./components/ui/separator.tsx";
export { Skeleton } from "./components/ui/skeleton.tsx";
export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "./components/ui/tooltip.tsx";
export { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs.tsx";
export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
} from "./components/ui/breadcrumb.tsx";
export {
  Progress,
  ProgressTrack,
  ProgressIndicator,
  ProgressLabel,
  ProgressValue,
} from "./components/ui/progress.tsx";
export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "./components/ui/sidebar.tsx";

// Composed components
export {
  StatusBadge,
  statusToneClass,
  type StatusTone,
  type SemanticStatusTone,
  type LegacyStatusTone,
  type StatusBadgeProps,
} from "./components/status-badge.tsx";
export { CompletionRing, type CompletionRingProps } from "./components/completion-ring.tsx";
export { TableToolbar, type TableToolbarProps } from "./components/table-toolbar.tsx";
export {
  DataTable,
  type DataTableProps,
  type DataTableColumn,
  type DataTableAction,
} from "./components/data-table.tsx";

// Deferred (Offerings plugin) — stable API, placeholder implementations
export { GanttChart, ResourceTable, MilestoneList } from "./components/deferred.tsx";
