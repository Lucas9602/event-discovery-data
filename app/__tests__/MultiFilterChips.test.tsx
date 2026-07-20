import { fireEvent, render, screen } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MultiFilterChips } from "../src/demo/MultiFilterChips";
import { ThemeProvider } from "../src/demo/theme";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const OPTIONS = [
  { value: "alle", label: "Alle" },
  { value: "weinfest", label: "Weinfest" },
  { value: "konzert", label: "Konzert" },
];

describe("MultiFilterChips", () => {
  it("renders every option's label", async () => {
    await render(
      <ThemeProvider>
        <MultiFilterChips options={OPTIONS} selected={[]} onToggle={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.getByText("Alle")).toBeTruthy();
    expect(screen.getByText("Weinfest")).toBeTruthy();
    expect(screen.getByText("Konzert")).toBeTruthy();
  });

  it("calls onToggle with the tapped option's value", async () => {
    const onToggle = jest.fn();
    await render(
      <ThemeProvider>
        <MultiFilterChips options={OPTIONS} selected={[]} onToggle={onToggle} />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByText("Weinfest"));
    expect(onToggle).toHaveBeenCalledWith("weinfest");
  });

  it("calls onToggle with 'alle' when the Alle chip is tapped, regardless of current selection", async () => {
    const onToggle = jest.fn();
    await render(
      <ThemeProvider>
        <MultiFilterChips options={OPTIONS} selected={["weinfest", "konzert"]} onToggle={onToggle} />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByText("Alle"));
    expect(onToggle).toHaveBeenCalledWith("alle");
  });
});
