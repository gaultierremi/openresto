import { act, screen } from "@testing-library/react-native";
import Button from "@/components/common/Button";

/**
 * Calls the `onPress` a `Button` was handed, by its label, past the guard `Pressable` puts in
 * front of a disabled or busy one. A handler that refuses on its own (a second press while a call
 * is in flight, a reason below the minimum) is only reachable this way, which is the point: the
 * button greying out is one defence, and the handler refusing is the other one.
 */
export function invokeOnPress(label: string): void {
  const buttons = screen.UNSAFE_getAllByType(Button).filter((b) => b.props.children === label);
  const target = buttons[buttons.length - 1];
  act(() => {
    target.props.onPress();
  });
}
