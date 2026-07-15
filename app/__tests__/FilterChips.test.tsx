import { fireEvent, render, screen } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FilterChips } from "../src/demo/FilterChips";
import { ThemeProvider } from "../src/demo/theme";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const OPTIONS = [
  { value: "alle", label: "Alle" },
  { value: "weinfest", label: "Weinfest" },
  { value: "konzert", label: "Konzert" },
];

describe("FilterChips", () => {
  it("renders every option's label", async () => {
    await render(
      <ThemeProvider>
        <FilterChips options={OPTIONS} selected="alle" onSelect={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.getByText("Alle")).toBeTruthy();
    expect(screen.getByText("Weinfest")).toBeTruthy();
    expect(screen.getByText("Konzert")).toBeTruthy();
  });

  it("calls onSelect with the tapped option's value", async () => {
    const onSelect = jest.fn();
    await render(
      <ThemeProvider>
        <FilterChips options={OPTIONS} selected="alle" onSelect={onSelect} />
      </ThemeProvider>,
    );
    fireEvent.press(screen.getByText("Weinfest"));
    expect(onSelect).toHaveBeenCalledWith("weinfest");
  });
});
