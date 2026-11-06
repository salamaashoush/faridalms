import type { ComponentProps } from "react";

import { Button } from "../button";
import { DialogContent as Content, DialogClose } from "../dialog";
import { X } from "lucide-react";

import { useSystemStrings } from "./provider";

export {
  Dialog,
  DialogTrigger,
  DialogTitle,
  DialogDescription,
  DialogHeader,
  DialogFooter,
  DialogClose,
} from "../dialog";

export type DialogContentProps = ComponentProps<typeof Content>;

/** A dialog's body with a close button named in the reader's language. */
export function DialogContent({ children, ...props }: DialogContentProps) {
  const strings = useSystemStrings();
  return (
    <Content {...props} showCloseButton={false}>
      {children}
      <DialogClose
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute end-4 top-4"
            aria-label={strings.close}
          />
        }
      >
        <X aria-hidden />
      </DialogClose>
    </Content>
  );
}
