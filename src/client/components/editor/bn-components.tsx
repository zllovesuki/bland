import { forwardRef, type ComponentType } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { ShadCNDefaultComponents, type ShadCNComponents } from "@blocknote/shadcn";

/** Wrap a floating-content component to disable collision avoidance (no flip while open). */
function noFlip<C extends ComponentType<any>>(Component: C): C {
  const Comp = Component as ComponentType<any>;
  return forwardRef<HTMLDivElement, any>((props, ref) => (
    <Comp {...props} avoidCollisions={false} ref={ref} />
  )) as unknown as C;
}

/**
 * Wrap PopoverContent in a Radix Portal so it renders at document.body.
 * Without this, popover content stays inline inside the floating toolbar,
 * where the toolbar's Floating UI `transform` breaks `position: fixed`
 * and the app shell's `overflow-hidden` clips the panel.
 */
const PortaledPopoverContent = forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof ShadCNDefaultComponents.Popover.PopoverContent>
>((props, ref) => (
  <PopoverPrimitive.Portal>
    <ShadCNDefaultComponents.Popover.PopoverContent {...props} ref={ref} />
  </PopoverPrimitive.Portal>
)) as typeof ShadCNDefaultComponents.Popover.PopoverContent;

export const customShadcnComponents: Partial<ShadCNComponents> = {
  Popover: {
    ...ShadCNDefaultComponents.Popover,
    PopoverContent: PortaledPopoverContent,
  },
  Select: {
    ...ShadCNDefaultComponents.Select,
    SelectContent: noFlip(ShadCNDefaultComponents.Select.SelectContent),
  },
  DropdownMenu: {
    ...ShadCNDefaultComponents.DropdownMenu,
    DropdownMenuContent: noFlip(ShadCNDefaultComponents.DropdownMenu.DropdownMenuContent),
    DropdownMenuSubContent: noFlip(ShadCNDefaultComponents.DropdownMenu.DropdownMenuSubContent),
  },
};
