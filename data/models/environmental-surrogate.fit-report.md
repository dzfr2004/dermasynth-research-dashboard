# Environmental surrogate fit report

Input: `data/models/environmental-context-training.v1.csv` (140 rows, source: constructed)
Method: non-negative least squares with intercept (best all-subsets OLS)
Weight status: `fitted_to_constructed_labelled_dataset`

| Context | Rows | R² | RMSE | w UV | w humidity | w PM2.5 | w temperature | Max abs. error vs generating prior |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| acne | 14 | 0.991 | 0.014 | 0.118 | 0.305 | 0.372 | 0.235 | 0.028 |
| barrier | 14 | 0.979 | 0.019 | 0.191 | 0.393 | 0.244 | 0.158 | 0.029 |
| pigment | 14 | 0.993 | 0.017 | 0.508 | 0.136 | 0.286 | 0.088 | 0.036 |
| dryness | 14 | 0.975 | 0.020 | 0.120 | 0.522 | 0.149 | 0.201 | 0.019 |
| oil | 14 | 0.991 | 0.011 | 0.133 | 0.323 | 0.204 | 0.362 | 0.013 |
| sensitivity | 14 | 0.990 | 0.011 | 0.249 | 0.347 | 0.246 | 0.144 | 0.014 |
| texture | 14 | 0.991 | 0.013 | 0.279 | 0.120 | 0.345 | 0.265 | 0.065 |
| redness | 14 | 0.983 | 0.013 | 0.315 | 0.212 | 0.169 | 0.359 | 0.054 |
| radiance | 14 | 0.989 | 0.013 | 0.397 | 0.133 | 0.392 | 0.142 | 0.032 |
| pores | 14 | 0.974 | 0.017 | 0.118 | 0.376 | 0.217 | 0.315 | 0.035 |

The constructed dataset is generated from known prior weights plus bounded noise, so a correct fitting method should recover those priors. This checks the method; it is not clinical evidence.

