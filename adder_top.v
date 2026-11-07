// ============================================================================
//  4-bit Ripple-Carry Adder for the Terasic DE10-Lite (MAX 10 10M50DAF484C7G)
//
//  Inputs  : SW[3:0] = A,  SW[7:4] = B,  SW[8] = Carry-in
//  Outputs : LEDR[3:0] = Sum,  LEDR[4] = Carry-out
//            HEX5 = A (hex),  HEX4 = B (hex),  HEX1:HEX0 = {Cout,Sum} (hex)
//            HEX2, HEX3 = blank
//
//  Port names/widths match the Terasic System Builder output (HEXn are [7:0],
//  bit 7 = decimal point, not populated on this board -> tied high = off).
//  Top-level entity name MUST match the Quartus project's top-level: adder_top
// ============================================================================

// ---------- 1-bit full adder, built from gates ----
module full_adder (
    input  wire a,
    input  wire b,
    input  wire cin,
    output wire sum,
    output wire cout
);
    wire axb;
    assign axb  = a ^ b;                 // half-adder 1
    assign sum  = axb ^ cin;             // half-adder 2
    assign cout = (a & b) | (axb & cin); // carry
endmodule


// ---------- N-bit ripple-carry adder made of full_adder instances -----------
module ripple_adder #(
    parameter N = 4
)(
    input  wire [N-1:0] a,
    input  wire [N-1:0] b,
    input  wire         cin,
    output wire [N-1:0] sum,
    output wire         cout
);
    wire [N:0] c;              // carry chain, c[0] = cin, c[N] = cout
    assign c[0] = cin;

    genvar i;
    generate
        for (i = 0; i < N; i = i + 1) begin : fa_chain
            full_adder fa (
                .a   (a[i]),
                .b   (b[i]),
                .cin (c[i]),
                .sum (sum[i]),
                .cout(c[i+1])
            );
        end
    endgenerate

    assign cout = c[N];
endmodule


// ---------- Hex digit -> 7-segment (common anode: 0 = segment ON) -----------
//  Segment index (manual Fig. 3-17):  0=top 1=top-right 2=bottom-right
//                                     3=bottom 4=bottom-left 5=top-left 6=middle
module seg7_decoder (
    input  wire [3:0] hex,
    output reg  [6:0] seg
);
    always @(*) begin
        case (hex)          //  6543210
            4'h0: seg = 7'b1000000;
            4'h1: seg = 7'b1111001;
            4'h2: seg = 7'b0100100;
            4'h3: seg = 7'b0110000;
            4'h4: seg = 7'b0011001;
            4'h5: seg = 7'b0010010;
            4'h6: seg = 7'b0000010;
            4'h7: seg = 7'b1111000;
            4'h8: seg = 7'b0000000;
            4'h9: seg = 7'b0010000;
            4'hA: seg = 7'b0001000;
            4'hB: seg = 7'b0000011;
            4'hC: seg = 7'b1000110;
            4'hD: seg = 7'b0100001;
            4'hE: seg = 7'b0000110;
            4'hF: seg = 7'b0001110;
            default: seg = 7'b1111111; // blank
        endcase
    end
endmodule


// ---------- Top level: connects board I/O to the adder ----------------------
module adder_top (
    input  wire [9:0] SW,
    output wire [9:0] LEDR,
    output wire [7:0] HEX0,
    output wire [7:0] HEX1,
    output wire [7:0] HEX2,
    output wire [7:0] HEX3,
    output wire [7:0] HEX4,
    output wire [7:0] HEX5
);
    wire [3:0] a    = SW[3:0];
    wire [3:0] b    = SW[7:4];
    wire       cin  = SW[8];
    wire [3:0] sum;
    wire       cout;

    ripple_adder #(.N(4)) u_adder (
        .a   (a),
        .b   (b),
        .cin (cin),
        .sum (sum),
        .cout(cout)
    );

    // LEDs: sum on LEDR[3:0], carry-out on LEDR[4]; LEDR[9] echoes carry-in
    assign LEDR[3:0] = sum;
    assign LEDR[4]   = cout;
    assign LEDR[8:5] = 4'b0000;
    assign LEDR[9]   = cin;

    // 7-segment displays (segments [6:0]); decimal points [7] off
    seg7_decoder d_a   (.hex(a),            .seg(HEX5[6:0])); // operand A
    seg7_decoder d_b   (.hex(b),            .seg(HEX4[6:0])); // operand B
    seg7_decoder d_hi  (.hex({3'b000,cout}),.seg(HEX1[6:0])); // result high digit (0 or 1)
    seg7_decoder d_lo  (.hex(sum),          .seg(HEX0[6:0])); // result low digit

    assign HEX2[6:0] = 7'b1111111; // blank
    assign HEX3[6:0] = 7'b1111111; // blank

    assign {HEX5[7], HEX4[7], HEX3[7], HEX2[7], HEX1[7], HEX0[7]} = 6'b111111;
endmodule
