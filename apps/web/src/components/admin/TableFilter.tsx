import { PlusCircle } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "~/components/ui/dropdown-menu";

export function TableFilter({
  label,
  value,
  classes,
  onChange,
}: {
  id?: string;
  label: string;
  value: string;
  classes: { id: string; name: string }[];
  onChange: (value: string) => void;
}) {
  const active = classes.find((option) => option.id === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className="h-8 border-dashed" />
        }
      >
        <PlusCircle aria-hidden className="size-4" />
        {label}
        {active && active.id !== "all" ? (
          <Badge variant="secondary" className="rounded-sm px-1.5 font-normal">
            {active.name}
          </Badge>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {classes.map((option) => (
            <DropdownMenuRadioItem key={option.id} value={option.id}>
              {option.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
