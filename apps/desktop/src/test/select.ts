import { screen } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

export async function selectComboboxOption(
  user: UserEvent,
  combobox: HTMLElement,
  optionName: string,
) {
  await user.click(combobox);
  await user.click(await screen.findByRole("option", { name: optionName }));
}
