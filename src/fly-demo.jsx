import React, { useRef, useEffect } from "react";
import * as d3 from "d3";

const FlyingAnimation = () => {
  const svgRef = useRef(null);
  const rectRef = useRef(null);
  const textRef = useRef(null);
  const targetDivRef = useRef(null);
  const overlayRef = useRef(null);

  useEffect(() => {
    // Get references to elements
    const svg = d3.select(svgRef.current);
    const rect = d3.select(rectRef.current);
    const text = d3.select(textRef.current);
    const targetDiv = targetDivRef.current;
    const overlay = d3.select(overlayRef.current);

    // Get bounding boxes for start (rect) and end (target div)
    const rectBox = rect.node().getBoundingClientRect();
    const targetBox = targetDiv.getBoundingClientRect();

    // Calculate start position (center of the rect)
    const startX = rectBox.left + rectBox.width / 2;
    const startY = rectBox.top + rectBox.height / 2;

    // Calculate end position (top-right corner of the div)
    const endX = targetBox.right; // Right edge of the div
    const endY = targetBox.top;   // Top edge of the div

    // Create a temporary flying rectangle in the overlay
    const flyingRectContainer = overlay.append("div")
      .style("position", "fixed")
      .style("left", `${startX - rectBox.width / 2}px`) // Adjust for rect width
      .style("top", `${startY - rectBox.height / 2}px`) // Adjust for rect height
      .style("width", `${rectBox.width}px`)
      .style("height", `${rectBox.height}px`)
      .style("display", "flex")
      .style("align-items", "center")
      .style("justify-content", "center")
      .style("background-color", "lightblue")
      .style("color", "black")
      .style("border", "1px solid black")
      .style("border-radius", "4px")
      .style("z-index", 1000) // Ensure it appears on top
      .text(text.text()); // Copy the text content from the SVG

    // Animate the flying rectangle to the top-right corner of the div
    flyingRectContainer
      .transition()
      .duration(2000)
      .ease(d3.easeCubicInOut)
      .style("left", `${endX - rectBox.width}px`) // Align to top-right corner
      .style("top", `${endY}px`)
      .on("end", () => {
        console.log("Reached target!");

        // Animate back to original position
        flyingRectContainer
          .transition()
          .duration(2000)
          .ease(d3.easeCubicInOut)
          .style("left", `${startX - rectBox.width / 2}px`) // Back to start X
          .style("top", `${startY - rectBox.height / 2}px`) // Back to start Y
          .on("end", () => {
            console.log("Returned to origin!");
            flyingRectContainer.remove(); // Remove flying rectangle after returning
          });
      });
  }, []);

  return (
    <div>
      {/* SVG with rectangle and text */}
      <svg ref={svgRef} width={800} height={600} style={{ border: "1px solid black" }}>
        <g>
          <rect ref={rectRef} x={100} y={100} width={120} height={50} fill="lightblue" stroke="black" />
          <text ref={textRef} x={160} y={130} textAnchor="middle" alignmentBaseline="middle" fill="black">
            Flying Box
          </text>
        </g>
      </svg>

      {/* Target div */}
      <div
        ref={targetDivRef}
        style={{
          marginTop: "50px",
          padding: "20px",
          backgroundColor: "lightgray",
          display: "inline-block",
        }}
      >
        Target Div
      </div>

      {/* Overlay container for animations */}
      <div ref={overlayRef} style={{ position: "relative", pointerEvents: "none" }}></div>
    </div>
  );
};

export default FlyingAnimation;
