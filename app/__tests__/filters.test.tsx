import { Pressable, Text } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { FilterProvider, useFilters } from "../src/demo/filters";

function Probe() {
  const { selectedCategories, zeitraum, toggleCategory, setZeitraum, resetFilters } = useFilters();
  return (
    <>
      <Text>{selectedCategories.join(",") || "none"}</Text>
      <Text>{zeitraum}</Text>
      <Pressable onPress={() => toggleCategory("weinfest")}>
        <Text>toggle-weinfest</Text>
      </Pressable>
      <Pressable onPress={() => toggleCategory("konzert")}>
        <Text>toggle-konzert</Text>
      </Pressable>
      <Pressable onPress={() => toggleCategory("alle")}>
        <Text>clear-categories</Text>
      </Pressable>
      <Pressable onPress={() => setZeitraum("diese-woche")}>
        <Text>set-zeitraum</Text>
      </Pressable>
      <Pressable onPress={resetFilters}>
        <Text>reset</Text>
      </Pressable>
    </>
  );
}

describe("FilterProvider", () => {
  it("defaults to no selected categories and zeitraum alle", async () => {
    await render(
      <FilterProvider>
        <Probe />
      </FilterProvider>,
    );
    expect(await screen.findByText("none")).toBeTruthy();
    expect(await screen.findByText("alle")).toBeTruthy();
  });

  it("adds a category on toggle and combines multiple selections", async () => {
    await render(
      <FilterProvider>
        <Probe />
      </FilterProvider>,
    );
    await fireEvent.press(screen.getByText("toggle-weinfest"));
    expect(await screen.findByText("weinfest")).toBeTruthy();
    await fireEvent.press(screen.getByText("toggle-konzert"));
    expect(await screen.findByText("weinfest,konzert")).toBeTruthy();
  });

  it("removes a category on a second toggle of the same value", async () => {
    await render(
      <FilterProvider>
        <Probe />
      </FilterProvider>,
    );
    await fireEvent.press(screen.getByText("toggle-weinfest"));
    await fireEvent.press(screen.getByText("toggle-weinfest"));
    expect(await screen.findByText("none")).toBeTruthy();
  });

  it("clears all selected categories when toggled with 'alle'", async () => {
    await render(
      <FilterProvider>
        <Probe />
      </FilterProvider>,
    );
    await fireEvent.press(screen.getByText("toggle-weinfest"));
    await fireEvent.press(screen.getByText("toggle-konzert"));
    await fireEvent.press(screen.getByText("clear-categories"));
    expect(await screen.findByText("none")).toBeTruthy();
  });

  it("resetFilters clears categories and zeitraum together", async () => {
    await render(
      <FilterProvider>
        <Probe />
      </FilterProvider>,
    );
    await fireEvent.press(screen.getByText("toggle-weinfest"));
    await fireEvent.press(screen.getByText("set-zeitraum"));
    await fireEvent.press(screen.getByText("reset"));
    expect(await screen.findByText("none")).toBeTruthy();
    expect(await screen.findByText("alle")).toBeTruthy();
  });
});
