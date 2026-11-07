import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "../button";
import { cn } from "../cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../dropdown-menu";
import { useSystemStrings } from "./provider";

export interface ThemeToggleProps {
  className?: string;
}

/** Light, dark or the device's own, from a button outside any menu. */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { setTheme } = useTheme();
  const strings = useSystemStrings();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "text-muted-foreground hover:bg-muted hover:text-foreground",
              className,
            )}
          >
            <Sun className="size-5 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
            <Moon className="absolute size-5 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
            <span className="sr-only">{strings.theme}</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          {strings.themeLight}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          {strings.themeDark}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          {strings.themeSystem}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
