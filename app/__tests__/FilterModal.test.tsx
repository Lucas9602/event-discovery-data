import { fireEvent, render, screen } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FilterModal } from "../src/demo/FilterModal";
import { FilterProvider } from "../src/demo/filters";
import { ThemeProvider } from "../src/demo/theme";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

describe("FilterModal", () => {
  it("renders category and Zeitraum chips", async () => {
    await render(
      <ThemeProvider>
        <FilterProvider>
          <FilterModal visible onClose={() => {}} />
        </FilterProvider>
      </ThemeProvider>,
    );
    expect(await screen.findByText("Weinfest", {}, { timeout: 10000 })).toBeTruthy();
    expect(await screen.findByText("Diese Woche", {}, { timeout: 10000 })).toBeTruthy();
  }, 15000);

  it("calls onClose when Fertig is pressed", async () => {
    const onClose = jest.fn();
    await render(
      <ThemeProvider>
        <FilterProvider>
          <FilterModal visible onClose={onClose} />
        </FilterProvider>
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByText("Fertig"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when the close icon is pressed", async () => {
    const onClose = jest.fn();
    await render(
      <ThemeProvider>
        <FilterProvider>
          <FilterModal visible onClose={onClose} />
        </FilterProvider>
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByLabelText("Schließen"));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows custom date inputs only after 'Zeitraum wählen' is selected", async () => {
    await render(
      <ThemeProvider>
        <FilterProvider>
          <FilterModal visible onClose={() => {}} />
        </FilterProvider>
      </ThemeProvider>,
    );
    expect(screen.queryByPlaceholderText("Von (JJJJ-MM-TT)")).toBeNull();
    await fireEvent.press(screen.getByText("Zeitraum wählen"));
    expect(await screen.findByPlaceholderText("Von (JJJJ-MM-TT)")).toBeTruthy();
  });
});
