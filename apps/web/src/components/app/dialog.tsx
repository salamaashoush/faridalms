import type { ComponentProps } from "react";

import { Button } from "@faridalms/ui/button";
import { DialogContent as Content, DialogClose } from "@faridalms/ui/dialog";
import { X } from "lucide-react";

import * as m from "~/i18n/messages";

export {
  Dialog,
  DialogTrigger,
  DialogTitle,
  DialogDescription,
  DialogHeader,
  DialogFooter,
  DialogClose,
} from "@faridalms/ui/dialog";

export function DialogContent({
  children,
  ...props
}: ComponentProps<typeof Content>) {
  return (
    <Content {...props} showCloseButton={false}>
      {children}
      <DialogClose
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute end-4 top-4"
            aria-label={m.commonClose()}
          />
        }
      >
        <X aria-hidden />
      </DialogClose>
    </Content>
  );
}
