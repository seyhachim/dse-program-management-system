"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TabsList,
  TabsTrigger,
} from "@dse-pms/ui";

type CourseSpecSectionNavigationItem = {
  id: string;
  label: string;
};

export function CourseSpecSectionNavigation({
  items,
  value,
  onValueChange,
}: {
  items: readonly CourseSpecSectionNavigationItem[];
  value: string;
  onValueChange: (value: string) => void;
}) {
  const selectItems = Object.fromEntries(
    items.map((item) => [item.id, item.label]),
  );

  return (
    <>
      <div className="rounded-xl border border-border bg-card p-3 shadow-sm md:hidden">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Course Specification section
        </label>
        <Select
          items={selectItems}
          value={value}
          onValueChange={(nextValue) => {
            if (nextValue) onValueChange(nextValue);
          }}
        >
          <SelectTrigger
            aria-label="Course Specification section"
            className="mt-2 h-11 w-full data-[size=default]:h-11"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="hidden rounded-xl border border-border bg-card p-1.5 shadow-sm md:block">
        <TabsList
          variant="line"
          className="flex w-full justify-start gap-1 overflow-x-auto bg-transparent p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((item) => (
            <TabsTrigger
              key={item.id}
              value={item.id}
              className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-muted/60 hover:text-foreground data-[state=active]:bg-primary data-[state=active]:font-semibold data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
            >
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </>
  );
}
